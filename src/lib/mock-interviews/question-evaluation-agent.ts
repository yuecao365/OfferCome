import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { randomUUID } from "node:crypto";

import type { LoopHooks, LoopTool, LoopToolSet } from "@/lib/ai/agent-loop";
import { isAgentRunError, logAgentRun, runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import type { ContentLanguage } from "@/lib/i18n/locale";
import { getAiTaskConfig } from "@/lib/settings/ai";

import {
  parseQuestionEvaluationInput,
  quoteInAnswer,
  validateQuestionEvaluation,
  WEAKNESS_KINDS,
  type EvaluationMetrics,
  type EvaluationThreadContext,
  type MockInterviewQuestionEvaluation,
} from "./question-evaluation";
import { computeQuestionScore } from "./scoring";
import { createSkillTools, renderSkillIndex } from "./skills/tools";
import type { SkillPack } from "./skills/types";
import { createRecallTool } from "./tools/recall";
import { createResumeLookupTool } from "./tools/resume-lookup";

export const EVALUATION_PROMPT_VERSION = "evaluation-v9";
/** 产物在这个 confirm 档工具的入参上（与面试官的 ask_candidate 同一条路）。 */
export const EVALUATION_TOOL = "write_evaluation";
/** 最多 3 步查资料，之后必须写评分；再多一步给退回重写。 */
const LOOKUP_STEPS = 3;
const MAX_STEPS = 5;

/** trace 与缓存按语言区分：中文场次沿用原版本号，英文场次带 -en。 */
export function evaluationPromptVersion(language: ContentLanguage): string {
  return language === "en" ? `${EVALUATION_PROMPT_VERSION}-en` : EVALUATION_PROMPT_VERSION;
}

type ToolAvailability = { resume: boolean; skills: SkillPack[]; recall: boolean };

/** 提示词散文按场次语言各一份；结构、schema、插值逻辑只有一份（docs/i18n-plan.md §3）。 */
const COPY = {
  zh: {
    schema: {
      evidence: "支持这个分数的一句回答原话，逐字",
      gap: "这个维度缺了什么、错在哪，一句；没有就 null",
      strengthQuote: "逐字摘自回答",
      weaknessQuote: "error 时必填，逐字摘自回答；missing 可为 null",
      practice: "针对这条短板练什么，一句",
      verdict: "给候选人的一句结论，不报分数",
    },
    toolGuide: {
      resume: "- lookup_resume：project 段必须先按关键词查简历原文核对回答里的数字与事实（最多 3 次），其它段有可核对的事实也查。结果写进 resumeChecks：claim 逐字摘自回答，resumeSays 逐字来自工具返回的行，数字、单位、倍数、规模对不上就 consistent=false 并同时记一条 error 短板。没有可核对的事实就留空。",
      skills: (index: string) => `- load_skill：基础题 / 场景题拿不准这一层该讲什么时查技能包（最多 1 次）。索引：\n${index}`,
      recall: "- recall_sessions：按关键词查候选人档案（上几场的说法验证、反复出现的短板；最多 1 次）；上几场也漏了同一机制的，在对应短板的 point 里点出反复出现。",
      header: (steps: number, lines: string) => `\n\n只读工具（最多查 ${steps} 步，查完就写评分）：\n${lines}`,
    },
    system: (toolGuide: string) => `你是模拟面试逐题评分 Agent：只按 rubric 维度和候选人的实际回答评分，不下录用结论。评分用 ${EVALUATION_TOOL} 工具交，入参就是评分；被退回就按原因改一次再交。

怎么评：thread.kind 是这段的种类（project 项目深挖、quick 基础题、scenario 场景题引导式），probeCount 是候选人答过的追问句数，facets 是问过的角度。按实际问到的深度评：追到第 n 层答不上属于正常，按达到的深度给分，不按完美答案扣；追问少的段一两句回答正常，不因没展开扣分；expectedSignals 只是参考，换个角度答到位同样给分。difficulty 是答到阶梯第几层（1 名词，2 机制，3 取舍与边界，4 有判断且说得出怎么验证）；competencyId 只填 competencies 里的 id，对不上 null。

分带：90+ 准确、有取舍、能迁移；70–89 主干正确、细节或取舍有欠缺；50–69 有尝试但关键点缺失；50 以下关键内容错误或基本没答。

短板：最多 4 条，每条一句 point 加一句 practice（练什么，具体到动作）。error = 回答里有一句技术上站不住的具体陈述，quote 必须原样复制那句（系统逐字校验，改写的会被退回）；missing = 追问到了没答上、答偏，或该讲的关键机制没出现。笼统、不严谨、缺细节缺数字都不是 error。维度分要和短板对得上：关键机制没讲的维度要在 gap 和分数上体现；出现 error 的维度不超过 69。

写法：一切从简，不复述回答。dimension name 逐字用 rubric 里的名称，evidence 是一句回答原话；strengths 最多 3 条，quote 逐字摘自回答；verdict 一句话告诉候选人这段答到了哪、差在哪，不报分数；resumeChecks 没核对就是空数组。${toolGuide}`,
    toolDescription: "交这段的评分：维度分、优点、短板（各带练法）、一句结论、答到的层级、考的能力、简历核对。",
    untrustedInputs: "岗位描述、问题、回答、评分标准和面试官备注",
    noRubric: "这道题缺少有效的评分标准。",
    gate: {
      invalid: (issues: string) => `入参不合规：${issues}`,
      issueSeparator: "；",
      listSeparator: "、",
      unknownDimensions: (names: string, allowed: string) => `维度名不在 rubric 里：${names}（只能用 ${allowed}）`,
      missingDimensions: (names: string) => `缺维度：${names}`,
      strengthQuote: (quote: string) => `strengths 的 quote 不是回答原话：「${quote}」`,
      errorNeedsQuote: (point: string) => `error 短板必须带 quote：${point}`,
      weaknessQuote: (quote: string) => `weaknesses 的 quote 不是回答原话：「${quote}」`,
      claimQuote: (quote: string) => `resumeChecks 的 claim 不是回答原话：「${quote}」`,
      resumeQuote: (quote: string) => `resumeChecks 的 resumeSays 不是简历原话：「${quote}」`,
      retry: (problems: string) => `${problems}。逐字复制原话（可以截短，不要改字），改好后再调一次 ${EVALUATION_TOOL}`,
    },
    duplicateCall: "这个工具刚用同样的参数查过了，结果就在上面，不要重复查",
  },
  en: {
    schema: {
      evidence: "One sentence from the answer that supports this score, copied verbatim",
      gap: "One sentence on what this dimension is missing or gets wrong; null if nothing",
      strengthQuote: "Copied verbatim from the answer",
      weaknessQuote: "Required for error, copied verbatim from the answer; may be null for missing",
      practice: "One sentence on what to practise to close this gap",
      verdict: "One-sentence verdict for the candidate; no score",
    },
    toolGuide: {
      resume: "- lookup_resume: for a project segment you must first search the résumé by keyword and check the numbers and facts in the answer against it (at most 3 lookups); for other segments, look it up too whenever there is a checkable fact. Record the result in resumeChecks: claim copied verbatim from the answer, resumeSays copied verbatim from a line the tool returned. If numbers, units, multipliers or scale disagree, set consistent=false and also record an error weakness. Leave it empty when there is nothing to check.",
      skills: (index: string) => `- load_skill: on a fundamentals or scenario question, when you are unsure what an answer at this rung should cover, look up a skill pack (at most once). Index:\n${index}`,
      recall: "- recall_sessions: search the candidate's dossier by keyword (claims checked in earlier sessions, recurring weaknesses; at most once). If earlier sessions also missed the same mechanism, say in that weakness's point that it keeps recurring.",
      header: (steps: number, lines: string) => `\n\nRead-only tools (at most ${steps} lookup steps, then write the evaluation):\n${lines}`,
    },
    system: (toolGuide: string) => `You are the per-segment scoring agent for a mock technical interview. Score only against the rubric dimensions and what the candidate actually said; never make a hiring call. Submit your evaluation by calling the ${EVALUATION_TOOL} tool — its input is the evaluation. If it is sent back, fix what the reason says and submit once more.

How to score: thread.kind is the segment type (project = project deep dive, quick = quick fundamentals question, scenario = guided scenario question); probeCount is how many follow-up questions the candidate answered; facets are the angles that were asked. Score against the depth the interviewer actually reached: running out of answers at the n-th follow-up is normal — credit the depth reached rather than deducting against a perfect answer. A segment with few follow-ups naturally gets one- or two-sentence answers; don't penalize the candidate for not elaborating. expectedSignals are only a reference: a solid answer from a different angle earns the same credit. difficulty is the highest rung the answer reached (1 names the concept, 2 explains the mechanism, 3 covers trade-offs and limits, 4 has an own judgment and can say how to verify it). competencyId must be an id from competencies; use null if none fits.

Score bands: 90+ accurate, weighs trade-offs, transfers to new situations; 70–89 core is right, but details or trade-offs are thin; 50–69 a real attempt with key points missing; below 50 key content is wrong or the question is essentially unanswered.

Weaknesses: at most 4, each a one-sentence point plus a one-sentence practice (what to practise, down to a concrete action). error = the answer contains a specific statement that is technically wrong; quote must copy that sentence exactly (the system checks it word for word and sends paraphrases back). missing = a follow-up was asked and not answered, the answer drifted off the question, or a key mechanism that should have come up never did. Being vague, imprecise, or short on detail or numbers is not an error. Dimension scores must agree with the weaknesses: a dimension whose key mechanism went unexplained must show it in gap and in its score; any dimension with an error scores 69 or lower.

Style: keep everything lean and don't restate the answer. Use the rubric names verbatim as dimension names; evidence is one sentence quoted from the answer; at most 3 strengths, each quote copied verbatim from the answer; verdict is one sentence telling the candidate how far this segment got and where it fell short, without a score; resumeChecks is an empty array when you checked nothing.

Language: write every free-text field you author (gap, point, practice, verdict) in English, even when the job description or the résumé is in another language. Quoted fields (evidence, quote, claim, resumeSays) are copied verbatim from their source in whatever language it uses.${toolGuide}`,
    toolDescription: "Submit this segment's evaluation: dimension scores, strengths, weaknesses (each with a practice), a one-sentence verdict, the rung reached, the competency tested, and résumé checks.",
    untrustedInputs: "the job description, question, answer, rubric and interviewer notes",
    noRubric: "This question has no valid rubric.",
    gate: {
      invalid: (issues: string) => `Invalid input: ${issues}`,
      issueSeparator: "; ",
      listSeparator: ", ",
      unknownDimensions: (names: string, allowed: string) => `Dimension names not in the rubric: ${names} (use only ${allowed})`,
      missingDimensions: (names: string) => `Missing dimensions: ${names}`,
      strengthQuote: (quote: string) => `strengths quote is not the candidate's wording: "${quote}"`,
      errorNeedsQuote: (point: string) => `an error weakness must include a quote: ${point}`,
      weaknessQuote: (quote: string) => `weaknesses quote is not the candidate's wording: "${quote}"`,
      claimQuote: (quote: string) => `resumeChecks claim is not the candidate's wording: "${quote}"`,
      resumeQuote: (quote: string) => `resumeChecks resumeSays is not the résumé's wording: "${quote}"`,
      retry: (problems: string) => `${problems}. Copy the original wording verbatim (you may shorten it, but don't change any words), then call ${EVALUATION_TOOL} again.`,
    },
    duplicateCall: "This tool was just called with the same arguments and the result is above; don't repeat the lookup.",
  },
} satisfies Record<ContentLanguage, unknown>;

/**
 * 一份 schema 逻辑：字段与约束两种语言相同，只有给模型看的 describe 与长度上限随语言变——
 * 英文同样的意思字符数约是中文的三倍，照搬中文上限会把正常的英文输出判成不合规。
 */
function buildEvaluationSchema(language: ContentLanguage) {
  const text = COPY[language].schema;
  const len = (zh: number) => (language === "en" ? zh * 3 : zh);
  return z.object({
    dimensions: z.array(
      z.object({
        name: z.string().min(1).max(len(100)),
        score: z.number().min(0).max(100),
        evidence: z.string().max(len(240)).describe(text.evidence),
        gap: z.string().max(len(120)).nullable().describe(text.gap),
      }),
    ),
    strengths: z
      .array(z.object({ point: z.string().min(1).max(len(80)), quote: z.string().max(len(120)).describe(text.strengthQuote) }))
      .max(3),
    weaknesses: z
      .array(
        z.object({
          point: z.string().min(1).max(len(120)),
          quote: z.string().max(len(120)).nullable().describe(text.weaknessQuote),
          kind: z.enum(WEAKNESS_KINDS),
          practice: z.string().min(1).max(len(120)).describe(text.practice),
        }),
      )
      .max(4),
    verdict: z.string().min(1).max(len(120)).describe(text.verdict),
    /** 候选人实际答到阶梯第几层：1 只到概念或名词，2 说清了机制，3 讲到了取舍与边界，4 有自己的判断并说得出怎么验证。 */
    difficulty: z.number().int().min(1).max(4),
    /** 这段主要考的能力（competencies 里的 id）；对不上填 null。 */
    competencyId: z.string().max(40).nullable(),
    /** 简历核对：回答里的哪句（逐字）、简历原文怎么写（逐字）、是否一致。没核对就空数组。 */
    resumeChecks: z
      .array(z.object({ claim: z.string().min(1).max(len(200)), resumeSays: z.string().min(1).max(len(300)), consistent: z.boolean() }))
      .max(2),
  });
}

type EvaluationSchema = ReturnType<typeof buildEvaluationSchema>;
type EvaluationOutput = z.infer<EvaluationSchema>;
const EVALUATION_SCHEMAS: Record<ContentLanguage, EvaluationSchema> = { zh: buildEvaluationSchema("zh"), en: buildEvaluationSchema("en") };

/** 工具的用法写进提示词：代码不替它选。哪个工具给了才写哪段。 */
function toolGuide(tools: ToolAvailability, language: ContentLanguage): string {
  const copy = COPY[language].toolGuide;
  const lines: string[] = [];
  if (tools.resume) lines.push(copy.resume);
  if (tools.skills.length > 0) lines.push(copy.skills(renderSkillIndex(tools.skills)));
  if (tools.recall) lines.push(copy.recall);
  return lines.length === 0 ? "" : copy.header(LOOKUP_STEPS, lines.join("\n"));
}

function systemPrompt(tools: ToolAvailability, language: ContentLanguage): string {
  return COPY[language].system(toolGuide(tools, language));
}

function createEvaluationTool(language: ContentLanguage): LoopTool {
  return {
    access: "confirm",
    ...tool({
      description: COPY[language].toolDescription,
      inputSchema: EVALUATION_SCHEMAS[language],
    }),
  };
}

/** 交评分前的硬门：schema、维度名、引用逐字、简历核对两头逐字。不过就把原因回给模型改一次。 */
function evaluationGate(input: unknown, rubricNames: Set<string>, answer: string, resumeText: string, language: ContentLanguage): string | null {
  const copy = COPY[language].gate;
  const parsed = EVALUATION_SCHEMAS[language].safeParse(input);
  if (!parsed.success) return copy.invalid(parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(copy.issueSeparator).slice(0, 400));
  const output = parsed.data;
  const problems: string[] = [];
  const unknownDimensions = output.dimensions.filter((item) => !rubricNames.has(item.name)).map((item) => item.name);
  if (unknownDimensions.length > 0) problems.push(copy.unknownDimensions(unknownDimensions.join(copy.listSeparator), [...rubricNames].join(copy.listSeparator)));
  const missingDimensions = [...rubricNames].filter((name) => !output.dimensions.some((item) => item.name === name));
  if (missingDimensions.length > 0) problems.push(copy.missingDimensions(missingDimensions.join(copy.listSeparator)));
  for (const item of output.strengths) if (!quoteInAnswer(answer, item.quote)) problems.push(copy.strengthQuote(item.quote.slice(0, 40)));
  for (const item of output.weaknesses) {
    if (item.kind === "error" && !item.quote) problems.push(copy.errorNeedsQuote(item.point.slice(0, 40)));
    else if (item.quote && !quoteInAnswer(answer, item.quote)) problems.push(copy.weaknessQuote(item.quote.slice(0, 40)));
  }
  for (const item of output.resumeChecks) {
    if (!quoteInAnswer(answer, item.claim)) problems.push(copy.claimQuote(item.claim.slice(0, 40)));
    if (!quoteInAnswer(resumeText, item.resumeSays)) problems.push(copy.resumeQuote(item.resumeSays.slice(0, 40)));
  }
  return problems.length === 0 ? null : copy.retry(problems.join(copy.issueSeparator));
}

/** 同一工具同样入参再调一次是无效调用：拒绝并把原因回给模型。 */
function dedupe(seen: Set<string>, call: { toolName: string; input: unknown }, language: ContentLanguage): string | null {
  const key = `${call.toolName}:${JSON.stringify(call.input)}`;
  if (seen.has(key)) return COPY[language].duplicateCall;
  seen.add(key);
  return null;
}

export type QuestionEvaluationResult = {
  evaluation: MockInterviewQuestionEvaluation;
  score: number;
  metrics: EvaluationMetrics;
  difficulty: number;
  competencyId: string | null;
};

export async function evaluateMockInterviewQuestion(input: {
  question: string;
  answer: string;
  rubric: unknown;
  expectedSignals: unknown;
  jobTitle: string;
  jobDescription: string;
  thread: EvaluationThreadContext | null;
  /** 岗位能力清单：评分挑这段主要考的那项。 */
  competencies: { id: string; name: string }[];
  /** 简历原文：给 lookup_resume 核对用；空串不给工具。 */
  resumeText?: string;
  /** 备课时选的技能包：给 load_skill；空数组不给工具。调用方按场次语言加载（loadSkillPacks(language)）。 */
  skillPacks?: SkillPack[];
  /** 候选人档案（会话快照里的，上几场）：给 recall_sessions；没有档案不给工具。 */
  dossier?: string | null;
  /** 记账用的 runId；不给就随机。 */
  runId?: string;
  /** 补跑时不给只读工具，少一类失败面。 */
  withTools?: boolean;
  /** 场次语言（brief.language）：提示词与自由文本字段的语言。缺省中文。 */
  language?: ContentLanguage;
}): Promise<QuestionEvaluationResult> {
  const language = input.language ?? "zh";
  const copy = COPY[language];
  const schema = EVALUATION_SCHEMAS[language];
  const promptVersion = evaluationPromptVersion(language);
  const parsed = parseQuestionEvaluationInput(input);
  if (parsed.rubric.length === 0) {
    throw new Error(copy.noRubric);
  }
  // 评分模型独立于面试官（InterviewBench S5：DeepSeek 当评分者压高分，gpt-5.4-mini 定层级 κ 0.82）。
  const config = await getAiTaskConfig("scoring");
  const startedAt = Date.now();
  const resumeText = input.resumeText ?? "";
  const skillPacks = input.skillPacks ?? [];
  const recall = createRecallTool(input.dossier, language);
  const withTools = input.withTools ?? true;
  const lookupTools: LoopToolSet = withTools
    ? {
        ...(resumeText ? { lookup_resume: createResumeLookupTool(resumeText, language) } : {}),
        ...(skillPacks.length > 0 ? createSkillTools(skillPacks, language).tools : {}),
        ...(recall ? { recall_sessions: recall } : {}),
      }
    : {};
  const hasLookup = Object.keys(lookupTools).length > 0;
  const tools: LoopToolSet = { ...lookupTools, [EVALUATION_TOOL]: createEvaluationTool(language) };
  const rubricNames = new Set(parsed.rubric.map((item) => item.name));
  const seen = new Set<string>();
  let gateUsed = false;
  const hooks: LoopHooks = {
    beforeTool: (call) => {
      if (call.toolName !== EVALUATION_TOOL) {
        const reason = dedupe(seen, call, language);
        return reason ? { allow: false, reason } : { allow: true };
      }
      // 硬门只退回一次：第二次再不过就放行，由 validateQuestionEvaluation 丢掉不合规的条目（评分不能因为一条引用卡死）。
      const reason = gateUsed ? null : evaluationGate(call.input, rubricNames, input.answer, resumeText, language);
      if (!reason) return { allow: true };
      gateUsed = true;
      return { allow: false, reason };
    },
  };
  const runId = input.runId ?? randomUUID();
  const rescue = salvageJson(schema);
  let output: EvaluationOutput;
  let steps = 1;
  let toolCalls = 0;
  try {
    // 模型没调工具而直接吐了 JSON（服务商工具调用弱）：rescue 从文本里抢救。
    const result = await runAgent({
      agent: "question_evaluation",
      runId,
      config,
      feature: "AI 模拟面试",
      promptVersion,
      language,
      schema,
      schemaName: "question_evaluation",
      maxOutputTokens: 1_600,
      timeoutMs: 60_000,
      tools,
      budget: { maxSteps: MAX_STEPS },
      hooks,
      output: "none",
      // 有只读工具时前几步让它查；之后只能交评分。服务商不支持指定工具时 runAgent 退化为 auto。
      toolChoiceAt: (step) => (hasLookup && step < LOOKUP_STEPS ? "required" : { type: "tool", toolName: EVALUATION_TOOL }),
      rescue,
      untrustedInputs: copy.untrustedInputs,
      system: systemPrompt({ resume: Boolean(lookupTools.lookup_resume), skills: withTools ? skillPacks : [], recall: Boolean(lookupTools.recall_sessions) }, language),
      payload: {
        jobTitle: input.jobTitle,
        // 评分不需要整份 JD：岗位重点已在 competencies 里，JD 只留个头给分带定位。
        jobDescription: input.jobDescription.slice(0, 1_500),
        question: input.question,
        answer: input.answer.slice(0, 20_000),
        rubric: parsed.rubric,
        expectedSignals: parsed.expectedSignals,
        thread: input.thread,
        competencies: input.competencies,
      },
    });
    output = result.output;
    steps = result.steps;
    toolCalls = result.toolCalls.length;
  } catch (error) {
    if (!isAgentRunError(error) || error.kind !== "interrupted" || error.pending?.toolName !== EVALUATION_TOOL) throw error;
    output = schema.parse(error.pending.input);
    const events = error.events ?? [];
    steps = events.filter((event) => event.type === "step_finished").length || 1;
    toolCalls = events.filter((event) => event.type === "tool_called" && event.call.toolName !== EVALUATION_TOOL).length;
  }
  const score = computeQuestionScore(parsed.rubric, output.dimensions);
  const validated = validateQuestionEvaluation(output, parsed.rubric, input.answer, score, resumeText);
  logAgentRun({
    runId,
    agent: "question_evaluation",
    event: "selection",
    status: "success",
    provider: config.provider,
    model: config.model,
    promptVersion,
    durationMs: Date.now() - startedAt,
    metrics: {
      score,
      ...validated.metrics,
      weaknessCount: validated.evaluation.weaknesses.length,
      gateUsed: gateUsed ? 1 : 0,
      steps,
      toolCalls,
    },
  });
  const competencyId = output.competencyId && input.competencies.some((item) => item.id === output.competencyId) ? output.competencyId : null;
  return { ...validated, score, difficulty: output.difficulty, competencyId };
}
