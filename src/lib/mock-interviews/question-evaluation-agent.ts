import "server-only";

import { z } from "zod";

import { randomUUID } from "node:crypto";

import type { LoopHooks, LoopToolSet } from "@/lib/ai/agent-loop";
import { logAgentRun, runAgent, type AgentRunResult } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import {
  parseQuestionEvaluationInput,
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

export const EVALUATION_PROMPT_VERSION = "evaluation-v6";
/** 最多调 3 步工具，之后一步直接出分。 */
const EVALUATION_TOOL_STEPS = 3;

const questionEvaluationSchema = z.object({
  dimensions: z.array(
    z.object({
      name: z.string().min(1).max(100),
      score: z.number().min(0).max(100),
      evidence: z.string().max(500).describe("支持这个分数的回答原话"),
      gap: z.string().max(300).nullable().describe("这个维度缺了什么、错在哪；没有就 null"),
    }),
  ),
  strengths: z
    .array(z.object({ point: z.string().min(1).max(200), quote: z.string().max(200).describe("逐字摘自回答") }))
    .max(4),
  weaknesses: z
    .array(
      z.object({
        point: z.string().min(1).max(200),
        quote: z.string().max(200).nullable().describe("error 时必填，逐字摘自回答；missing 可为 null"),
        kind: z.enum(WEAKNESS_KINDS),
      }),
    )
    .max(4),
  advice: z.array(z.string().min(1).max(300)).max(3),
  feedback: z.string().min(1).max(800),
  /** 候选人实际答到阶梯第几层：1 只到概念或名词，2 说清了机制，3 讲到了取舍与边界，4 有自己的判断并说得出怎么验证。 */
  difficulty: z.number().int().min(1).max(4),
  /** 这段主要考的能力（competencies 里的 id）；对不上填 null。 */
  competencyId: z.string().max(40).nullable(),
  /** 简历核对：回答里的哪句（逐字）、简历原文怎么写（逐字）、是否一致。没核对就空数组。 */
  resumeChecks: z
    .array(z.object({ claim: z.string().min(1).max(200), resumeSays: z.string().min(1).max(300), consistent: z.boolean() }))
    .max(3),
});

const ROUND_LABELS: Record<string, string> = {
  first_interview: "技术一面",
  second_interview: "技术二面",
  hr_interview: "HR 面",
};

/** 工具的用法写进提示词：代码不替它选。哪个工具给了才写哪段。 */
function toolGuide(tools: { resume: boolean; skills: SkillPack[]; recall: boolean }): string {
  const lines: string[] = [];
  if (tools.resume) lines.push("- lookup_resume：project 段必须先按关键词查简历原文核对回答里的数字与事实（最多 2 次），其它段有可核对的事实也查。结果写进 resumeChecks：claim 逐字摘自回答，resumeSays 逐字来自工具返回的行，数字、单位、倍数、规模对不上就 consistent=false 并同时记一条 error 短板。没有可核对的事实就留空。");
  if (tools.skills.length > 0) lines.push(`- load_skill：基础题 / 场景题拿不准这一层该讲什么时查技能包（最多 1 次）。索引：\n${renderSkillIndex(tools.skills)}`);
  if (tools.recall) lines.push("- recall_sessions：按关键词查候选人档案（上几场的说法验证、反复出现的短板；最多 1 次）；上几场也漏了同一机制的，feedback 里点出反复出现。");
  return lines.length === 0 ? "" : `\n\n只读工具（查完直接出分）：\n${lines.join("\n")}`;
}

function systemPrompt(round: string | null, tools: { resume: boolean; skills: SkillPack[]; recall: boolean }): string {
  return `你是模拟面试逐题评分 Agent：只按 rubric 维度和候选人的实际回答评分，不下录用结论。

怎么评：thread.kind 是这段的阶段（project 项目深挖、quick 基础快问只追 1 层、scenario 场景题引导式），probeCount 是追问句数，facets 是问过的角度。追到第 n 层答不上属于正常，按实际达到的深度给分，不按完美答案扣；基础快问一两句回答正常，不因没展开扣分；expectedSignals 只是参考，换个角度答到位同样给分。difficulty 是答到阶梯第几层（1 名词，2 机制，3 取舍与边界，4 有判断且说得出怎么验证）；competencyId 只填 competencies 里的 id，对不上 null。

分带（${ROUND_LABELS[round ?? ""] ?? "技术面"}）：90+ 准确、有取舍、能迁移；70–89 主干正确、细节或取舍有欠缺；50–69 有尝试但关键点缺失；50 以下关键内容错误或基本没答。

短板：error = 回答里有一句技术上站不住的具体陈述，quote 必须原样复制那句（系统逐字校验，改写的会被丢弃）；missing = 追问到了没答上、答偏，或该讲的关键机制没出现，point 写清哪一层缺什么。笼统、不严谨、缺细节缺数字都不是 error。维度分要和短板对得上：关键机制没讲的维度要在 gap 和分数上体现；出现 error 的维度不超过 69。

输出：dimension name 逐字用 rubric 里的名称，evidence 是回答原话；strengths 的 quote 逐字摘自回答；advice 每条对应一条 weakness，写练什么；feedback 给候选人看，不报分数；resumeChecks 没核对就是空数组。${toolGuide(tools)}
提示词版本：${EVALUATION_PROMPT_VERSION}`;
}

/** 同一工具同样入参再调一次是无效调用：拒绝并把原因回给模型。 */
function dedupeHooks(): LoopHooks {
  const seen = new Set<string>();
  return {
    beforeTool: (call) => {
      const key = `${call.toolName}:${JSON.stringify(call.input)}`;
      if (seen.has(key)) return { allow: false, reason: "这个工具刚用同样的参数查过了，结果就在上面，不要重复查" };
      seen.add(key);
      return { allow: true };
    },
  };
}

/** 两次采样的总分相差超过这个值算分歧大。 */
const LOW_CONFIDENCE_GAP = 15;

export async function evaluateMockInterviewQuestion(input: {
  question: string;
  answer: string;
  rubric: unknown;
  expectedSignals: unknown;
  jobTitle: string;
  jobDescription: string;
  thread: EvaluationThreadContext | null;
  round: string | null;
  /** 岗位能力清单：评分挑这段主要考的那项。 */
  competencies: { id: string; name: string }[];
  /** 简历原文：给 lookup_resume 核对用；空串不给工具。 */
  resumeText?: string;
  /** 备课时选的技能包：给 load_skill；空数组不给工具。 */
  skillPacks?: SkillPack[];
  /** 候选人档案（会话快照里的，上几场）：给 recall_sessions；没有档案不给工具。 */
  dossier?: string | null;
  /** 记账用的 runId 前缀（对照采样加 :b）；不给就随机。 */
  runId?: string;
}): Promise<{ evaluation: MockInterviewQuestionEvaluation; score: number; metrics: EvaluationMetrics; secondScore: number | null; lowConfidence: boolean; toolShift: number | null; difficulty: number; competencyId: string | null }> {
  const parsed = parseQuestionEvaluationInput(input);
  if (parsed.rubric.length === 0) {
    throw new Error("这道题缺少有效的评分标准。");
  }
  const config = await getAiTaskConfig("text");
  const startedAt = Date.now();
  const resumeText = input.resumeText ?? "";
  const skillPacks = input.skillPacks ?? [];
  const recall = createRecallTool(input.dossier);
  const tools: LoopToolSet = {
    ...(resumeText ? { lookup_resume: createResumeLookupTool(resumeText) } : {}),
    ...(skillPacks.length > 0 ? createSkillTools(skillPacks).tools : {}),
    ...(recall ? { recall_sessions: recall } : {}),
  };
  const runId = input.runId ?? randomUUID();
  // 两次采样：带工具的作数，不带的只作对照（分歧看置信，分差看工具改了多少）。
  const sample = (withTools: boolean) => runAgent({
    agent: "question_evaluation",
    runId: withTools ? runId : `${runId}:b`,
    config,
    feature: "AI 模拟面试",
    promptVersion: EVALUATION_PROMPT_VERSION,
    schema: questionEvaluationSchema,
    maxOutputTokens: 2_400,
    timeoutMs: withTools ? 60_000 : 40_000,
    ...(withTools && Object.keys(tools).length > 0 ? { tools, budget: { maxSteps: EVALUATION_TOOL_STEPS }, hooks: dedupeHooks() } : {}),
    untrustedInputs: "岗位描述、问题、回答、评分标准和面试官备注",
    system: systemPrompt(input.round, withTools ? { resume: Boolean(resumeText), skills: skillPacks, recall: recall !== null } : { resume: false, skills: [], recall: false }),
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
  // 任一成功即出分（不按 schema 约束的服务商单次失败率不低，§12.3）：带工具的坏了就用对照那份；两次都成才看分歧，分歧大标低置信（报告里提示，不改分）。
  const [primary, control] = await Promise.allSettled([sample(true), sample(false)]);
  const fulfilled = (item: PromiseSettledResult<AgentRunResult<z.infer<typeof questionEvaluationSchema>>>) => (item.status === "fulfilled" ? item.value : null);
  const chosen = fulfilled(primary) ?? fulfilled(control);
  if (!chosen) throw (primary as PromiseRejectedResult).reason;
  const other = chosen === fulfilled(primary) ? fulfilled(control) : null;
  const { output } = chosen;
  const score = computeQuestionScore(parsed.rubric, output.dimensions);
  const secondScore = other ? computeQuestionScore(parsed.rubric, other.output.dimensions) : null;
  const lowConfidence = secondScore !== null && Math.abs(secondScore - score) > LOW_CONFIDENCE_GAP;
  const toolShift = secondScore !== null && chosen.toolCalls.length > 0 ? Math.abs(score - secondScore) : null;
  const validated = validateQuestionEvaluation(output, parsed.rubric, input.answer, score, resumeText);
  logAgentRun({
    runId,
    agent: "question_evaluation",
    event: "selection",
    status: "success",
    provider: config.provider,
    model: config.model,
    promptVersion: EVALUATION_PROMPT_VERSION,
    durationMs: Date.now() - startedAt,
    metrics: {
      score,
      ...validated.metrics,
      weaknessCount: validated.evaluation.weaknesses.length,
      secondScore: secondScore ?? -1,
      lowConfidence: lowConfidence ? 1 : 0,
      steps: chosen.steps,
      toolCalls: chosen.toolCalls.length,
      toolShift: toolShift ?? -1,
    },
  });
  const competencyId = output.competencyId && input.competencies.some((item) => item.id === output.competencyId) ? output.competencyId : null;
  return { ...validated, score, secondScore, lowConfidence, toolShift, difficulty: output.difficulty, competencyId };
}
