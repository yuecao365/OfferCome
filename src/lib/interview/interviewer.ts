import { tool, type ModelMessage } from "ai";
import { z } from "zod";

import { stepsOf, toolCallsOf, type LoopTool, type LoopToolSet } from "@/lib/ai/agent-loop";
import type { AiTaskConfig } from "@/lib/ai/config";
import { isAgentRunError, runAgent, type AgentRunResult } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import { localeOfContent, type ContentLanguage } from "@/lib/i18n/locale";
import { BASIS_LABELS_I18N, briefOutputSchema, type InterviewArea, type InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { createSkillTools } from "@/lib/mock-interviews/skills/tools";
import type { SkillPack } from "@/lib/mock-interviews/skills/types";
import { createResumeLookupTool } from "@/lib/mock-interviews/tools/resume-lookup";

import { ablated } from "./eval/switches";
import { dossierExcerpt } from "./dossier-doc";
import type { TranscriptLine } from "./events";
import { INTERVIEWER_COPY, type InterviewerCopy } from "./interviewer-copy";
import { NOTES_MAX_CHARS } from "./notes";
import { planMaterials } from "./progress";
import { ACTIONS, renderState, SIGNALS, type InterviewState } from "./state";

/**
 * 面试官的一次调用（重建 v5 §3）：非流式，跑在 runAgent 循环上（工具走协议通道，先查后说）。
 * 模型看到议程与约束，自己判候选人这句是什么、选下一步做什么、写一行证据账、说一句话；代码只校验动作（constraints.ts）。
 * 上下文布局为了前缀缓存：系统提示（岗位、简历与档案、方法、技能包索引）整场不变；历史只追加；
 * 候选人这句单独一条；状态卡是最后一条用户消息。
 */

export const INTERVIEWER_PROMPT_VERSION = "interviewer-v14";
export const REPLY_MAX_CHARS = 500;
/** 简历超过这个长度才节选，并给 lookup_resume 工具查全文。 */
export const MAX_RESUME_CHARS = 6_000;
const MAX_JD_CHARS = 1_500;
const MAX_INLINE_CHARS = 120;
/** 历史前 20 回合不裁；超过才按块裁（一条条丢会让前缀每回合都变，缓存全失）。 */
const HISTORY_KEEP_TURNS = 20;
const HISTORY_BLOCK_CHARS = 4_000;
const TIMEOUT_MS = 60_000;
/** 没有提问工具时只有一步；有的话一回合最多 5 步：前两步可查资料（简历原文、方法书），之后必须提问；被退回重出、最后一次提问，再多就强制直接输出。 */
const TOOL_STEPS = 1;
const TOOL_STEPS_WITH_ASK = 5;
/** 前几步允许查资料（agent-freedom-plan §2.7）：面试中想核对简历或翻方法书不该没机会。 */
const FREE_STEPS = 2;
export const ASK_TOOL = "ask_candidate";
export const PLAN_TOOL = "write_plan";

export const interviewerOutputSchema = z.object({
  /** 候选人刚才那句是什么；开场（还没人说话）填 answered。 */
  signal: z.enum(SIGNALS),
  /** 这回合做什么。 */
  action: z.enum(ACTIONS),
  /** switch 时材料 id（只写 id，如 q2，不带名字）；其它为 null。 */
  target: z.string().nullable(),
  /** probe 时这一句在追什么，一个短语（≤ 40 字；可用议程里的建议角度，也可自起）；switch / clarify / end 为 null。 */
  facet: z.string().max(40).nullable(),
  /** 面试笔记：整份重写的 Markdown，四段固定标题（## 待验证 / ## 已有结论 / ## 存疑 / ## 接下来），≤ 800 字；开场交状态卡里预填的那份。 */
  notes: z.string().min(1).max(NOTES_MAX_CHARS.zh * 3),
  /** 对候选人说的话，纯文本。 */
  reply: z.string().min(1).max(REPLY_MAX_CHARS),
});
export type InterviewerOutput = z.infer<typeof interviewerOutputSchema>;
/** 模型没走工具、直接吐了 JSON 时从文本里抢救（旧路径的兜底）。 */
const rescueOutput = salvageJson(interviewerOutputSchema);

export type InterviewerContext = {
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  /** 备课选的技能包（≤ 3）：系统提示里只放索引，全文由 load_skill 按需加载。 */
  skillPacks?: SkillPack[];
  /** 候选人档案（上几场）：系统提示里放前三段的摘录。 */
  dossier?: string | null;
  /** 这个团队做什么（蓝图的业务）；JD 没写为 null。 */
  product?: string | null;
};

function inline(text: string): string {
  return text.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/[「」]/g, "").trim().slice(0, MAX_INLINE_CHARS);
}

function renderProject(area: InterviewArea, brief: InterviewBrief, lane: string, copy: InterviewerCopy): string {
  const claims = brief.hypotheses.filter((item) => item.projectId === area.projectId);
  return copy.agenda.project({
    id: area.id,
    lane,
    name: area.name,
    entry: area.entryQuestion,
    claims: claims.length > 0 ? claims.map((item) => copy.agenda.claim(item.id, item.evidence.replace(/\s+/g, " "), item.text)).join(copy.agenda.claimSeparator) : null,
    guides: area.guides,
  });
}

/** 议程：项目、基础题、场景题，每份带材料 id 与主线 / 备选标记（按节奏参考数，progress.ts）。整场不变；按场次语言写。 */
export function renderAgenda(brief: InterviewBrief): string {
  const language = brief.language ?? "zh";
  const copy = INTERVIEWER_COPY[language];
  const basisLabels = BASIS_LABELS_I18N[localeOfContent(language)];
  const lanes = new Map(planMaterials(brief).map((item) => [item.id, item.lane === "main" ? "" : copy.agenda.backupTag]));
  const laneOf = (area: InterviewArea) => lanes.get(area.id) ?? "";
  const projects = brief.areas.filter((area) => area.kind === "project").map((area) => renderProject(area, brief, laneOf(area), copy)).join("\n");
  const basisOf = (area: InterviewArea) => (area.basis ? copy.agenda.basis(basisLabels[area.basis.kind], area.basis.quote ? area.basis.quote.replace(/\s+/g, " ") : null, area.basis.note) : copy.agenda.noBasis);
  const quick = brief.areas.filter((area) => area.kind === "quick").map((area) => copy.agenda.quick({ id: area.id, lane: laneOf(area), name: area.name, basis: basisOf(area), entry: area.entryQuestion, guide: area.guides[0] ?? "" })).join("\n");
  const scenarios = brief.areas.filter((area) => area.kind === "scenario").map((area) => copy.agenda.scenario({ id: area.id, lane: laneOf(area), name: area.name, entry: area.entryQuestion, guides: area.guides, jdEvidence: area.jdEvidence })).join("\n");
  const jd = brief.hypotheses.filter((item) => item.source === "jd").map((item) => `- ${copy.agenda.claim(item.id, item.evidence.replace(/\s+/g, " "), item.text)}`).join("\n");
  return `${projects || copy.agenda.noProjects}\n${quick || copy.agenda.noQuick}\n${scenarios || copy.agenda.noScenarios}${jd ? `\n${copy.agenda.jdHeader}\n${jd}` : ""}\n${copy.agenda.footer}`;
}

function renderSkillSection(packs: SkillPack[], copy: InterviewerCopy): string {
  if (packs.length === 0) return "";
  return copy.skillSection(packs.map((pack) => copy.skillIndexLine(pack.name, pack.description)).join("\n"));
}

/** 这场的提示词版本：中文沿用原版本号，英文带 -en 后缀（trace 与缓存按它区分）。 */
export function interviewerPromptVersion(language: ContentLanguage): string {
  return language === "en" ? `${INTERVIEWER_PROMPT_VERSION}-en` : INTERVIEWER_PROMPT_VERSION;
}

/**
 * 系统提示词：会话创建时生成一次，之后整场字节不变（缓存前缀）。顺序：岗位 → 候选人 → 怎么面 → 输出。按场次语言写（规划与面试要传同一个语言）。
 * 议程不在这里——它是 write_plan 的工具结果，由 planningHead 回放在历史开头（合并施工图 B 段）；规划阶段与面试阶段用的是同一份。
 */
export function buildSystem(context: InterviewerContext, language: ContentLanguage = "zh"): string {
  const copy = INTERVIEWER_COPY[language];
  return copy.system({
    jobTitle: inline(context.jobTitle),
    product: context.product ? inline(context.product) : null,
    jobDescription: context.jobDescription.slice(0, MAX_JD_CHARS),
    resumeNote: context.resumeText.length > MAX_RESUME_CHARS ? copy.resumeExcerptNote : "",
    resume: context.resumeText.slice(0, MAX_RESUME_CHARS),
    dossier: context.dossier ? dossierExcerpt(context.dossier, undefined, language) : "",
    method: copy.method,
    skills: renderSkillSection(context.skillPacks ?? [], copy),
  });
}

/**
 * 对话历史：双方说过的话，只追加；前 20 回合不裁，超过才按 4 千字一块裁（前缀每长 4 千字才变一次）。
 * 面试官的话写成它当时的输出形状 `{"reply": …}`：历史是裸文本时 DeepSeek 在 JSON 模式下整回合只吐空白。
 */
export function buildHistory(transcript: TranscriptLine[], options: { json: boolean } = { json: true }): ModelMessage[] {
  // 走提问工具时不在 JSON 模式，面试官的话按裸文本给：JSON 形状的历史会让模型照抄成 {"reply"} 而不调工具。
  const lines = transcript.map((line) => ({ role: line.role === "candidate" ? ("user" as const) : ("assistant" as const), content: line.role === "candidate" || !options.json ? line.content : JSON.stringify({ reply: line.content }) }));
  const turns = transcript.filter((line) => line.role === "interviewer").length;
  if (turns <= HISTORY_KEEP_TURNS) return lines;
  const total = lines.reduce((sum, line) => sum + line.content.length, 0);
  const keep = lines.slice(-HISTORY_KEEP_TURNS * 2).reduce((sum, line) => sum + line.content.length, 0);
  const cut = Math.ceil(Math.max(0, total - keep) / HISTORY_BLOCK_CHARS) * HISTORY_BLOCK_CHARS;
  let dropped = 0;
  let start = 0;
  while (dropped < cut && start < lines.length - HISTORY_KEEP_TURNS * 2) {
    dropped += lines[start].content.length;
    start += 1;
  }
  return lines.slice(start);
}

/** 状态卡：代码写的事实（进度、角度、候选人信号、新信息量）+ 工具账 + 面试官自己的笔记，是最后一条用户消息；开场时说明开场并预填笔记。按场次语言（state.language）写。 */
export function renderCard(state: InterviewState, options: { toolsUsed: string[]; retry: string | null }): string {
  const copy = INTERVIEWER_COPY[state.language].card;
  const tools = options.toolsUsed.length > 0 ? copy.toolsUsed(options.toolsUsed) : "";
  // 曾在这里催模型"换到基础题前先 load_skill"：B 段起领域包正文已在规划回放里整场可见，这句只会把模型推去查已经在手上的东西。
  const retry = options.retry ? copy.retry(options.retry) : "";
  const notes = copy.notes(state.notes);
  if (state.phase === "opening") return `${copy.opening}${notes}${retry}`;
  // 消融"状态卡"时只留议程、历史与笔记，不告诉模型聊到哪了：用来量这份投影到底顶不顶用。
  if (ablated("statecard")) return `${copy.ablated}${notes}${retry}`;
  return `${copy.header}${renderState(state)}${tools}${notes}${retry}${copy.tail}`;
}

export function buildTools(context: InterviewerContext, language: ContentLanguage = "zh"): LoopToolSet {
  return {
    ...(context.resumeText.length > MAX_RESUME_CHARS ? { lookup_resume: createResumeLookupTool(context.resumeText, language) } : {}),
    ...((context.skillPacks ?? []).length > 0 && !ablated("packs") ? createSkillTools(context.skillPacks!, language).tools : {}),
    // 消融"提问工具"时不给它：模型退回直接输出 JSON 的旧路径，两条路径对照用。
    ...(ablated("asktool") ? {} : { [ASK_TOOL]: createAskTool(language) }),
    // 工具集整场不变（Manus：mask, don't remove）；面试阶段调它由钩子退回。
    [PLAN_TOOL]: createPlanTool(language),
  };
}

/**
 * 提问工具（合并施工图 A 段）：面试官对候选人说话的唯一动作。confirm 档——合法就挂起等候选人回答，
 * 这句话本身就是回合的产物。它没有 execute：动作合法性在 beforeTool 钩子里判，非法当失败的工具结果退回让模型改。
 */
export function createAskTool(language: ContentLanguage = "zh"): LoopTool {
  return {
    access: "confirm",
    ...tool({
      description: INTERVIEWER_COPY[language].askTool,
      inputSchema: interviewerOutputSchema,
    }),
  };
}

/** 规划工具：写议程。confirm 档——入参在钩子里过 schema 与依据门禁，通过即挂起，调用方拿着入参建简报并落库；议程作为它的结果回放在历史里。 */
export function createPlanTool(language: ContentLanguage = "zh"): LoopTool {
  return {
    access: "confirm",
    ...tool({
      description: INTERVIEWER_COPY[language].planTool,
      inputSchema: briefOutputSchema,
    }),
  };
}

/** write_plan 调用回放时的入参：议程的摘要（全文在工具结果里，不重复放两遍）。 */
function planDigest(brief: InterviewBrief): unknown {
  return {
    projects: brief.areas.filter((area) => area.kind === "project").map((area) => ({ id: area.id, name: area.name, question: area.entryQuestion })),
    quick: brief.areas.filter((area) => area.kind === "quick").map((area) => ({ id: area.id, name: area.name, basis: area.basis?.kind ?? null })),
    scenarios: brief.areas.filter((area) => area.kind === "scenario").map((area) => ({ id: area.id, name: area.name })),
    hypotheses: brief.hypotheses.length,
  };
}

/**
 * 规划阶段的回放（历史开头，整场不变，紧跟系统提示词是缓存前缀的一部分）：
 * 用户一句"先规划" → 助手 write_plan(摘要) → 议程全文。全部从 briefJson 投影出来，不另存一份；两回合之间字节相同，缓存才吃得到。
 * 技能包正文**不回放**：它在规划时读过、已经变成了议程；消融（施工图 §5.D）显示正文跟着每回合走对面试阶段零差异，只多付 43% token。
 */
export function planningHead(brief: InterviewBrief): ModelMessage[] {
  const copy = INTERVIEWER_COPY[brief.language ?? "zh"];
  const messages: ModelMessage[] = [{ role: "user", content: copy.planningOpener }];
  messages.push({ role: "assistant", content: [{ type: "tool-call", toolCallId: "plan-write", toolName: PLAN_TOOL, input: planDigest(brief) }] });
  messages.push({ role: "tool", content: [{ type: "tool-result", toolCallId: "plan-write", toolName: PLAN_TOOL, output: { type: "text", value: `${copy.planWritten}${renderAgenda(brief)}` } }] });
  return messages;
}

/** 对提问工具入参的判决：先按 schema 收，再交给回合的判决函数；任一不过就退回原因。 */
function askVerdict(input: unknown, judge: AskJudge | undefined, copy: InterviewerCopy): { allow: false; reason: string } | { allow: true } {
  const parsed = interviewerOutputSchema.safeParse(input);
  if (!parsed.success) return { allow: false, reason: copy.invalidInput(parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`)) };
  const reason = judge?.(parsed.data) ?? null;
  return reason ? { allow: false, reason } : { allow: true };
}

/** 同一场的请求路由到同一缓存分片（OpenAI prompt_cache_key）：runId 去掉回合序号。 */
export function cacheKeyOf(runId: string): string {
  return runId.replace(/:\d+(:\d+)?$/, "");
}

/** 回合对一次提议的判决：合法返回 null，否则返回退回原因（原话给模型）。 */
export type AskJudge = (output: InterviewerOutput) => string | null;

export type InterviewerCall = {
  runId: string;
  config: AiTaskConfig;
  brief: InterviewBrief;
  context: InterviewerContext;
  transcript: TranscriptLine[];
  candidateContent: string | null;
  card: string;
  /** 这回合开始前的面试状态（状态卡就是它的渲染）；不调模型的策略靠它决策。 */
  state: InterviewState;
  /** 提问工具的判决；不给就只按 schema 收。 */
  judge?: AskJudge;
};

/**
 * 一次调用：返回模型的结构化产出与工具调用。
 * 模型经 ask_candidate 说话时循环会挂起（confirm 档），runAgent 把它抛成 interrupted——那不是失败，那句话就是产物，接住变成正常返回。
 * 模型不调工具而直接输出 JSON 时（服务商工具调用弱，或消融关了工具）走原来的路。
 */
export async function runInterviewerTurn(input: InterviewerCall): Promise<AgentRunResult<InterviewerOutput>> {
  const content = input.candidateContent?.trim() ?? "";
  const tools = buildTools(input.context, input.brief.language ?? "zh");
  const hasAsk = ASK_TOOL in tools;
  const messages: ModelMessage[] = [
    ...planningHead(input.brief),
    ...buildHistory(input.transcript, { json: !hasAsk }),
    ...(content ? [{ role: "user" as const, content }] : []),
    { role: "user" as const, content: input.card },
  ];
  try {
    return await runInterviewerCall(input, messages, tools, hasAsk);
  } catch (error) {
    if (!isAgentRunError(error) || error.kind !== "interrupted" || error.pending?.toolName !== ASK_TOOL) throw error;
    return {
      output: interviewerOutputSchema.parse(error.pending.input),
      partial: false,
      runId: error.runId,
      provider: input.config.provider,
      model: input.config.model,
      durationMs: error.durationMs,
      usage: error.usage,
      steps: stepsOf(error.events),
      toolCalls: toolCallsOf(error.events),
      events: error.events,
    };
  }
}

function runInterviewerCall(input: InterviewerCall, messages: ModelMessage[], tools: LoopToolSet, hasAsk: boolean): Promise<AgentRunResult<InterviewerOutput>> {
  const language = input.brief.language ?? "zh";
  const copy = INTERVIEWER_COPY[language];
  return runAgent({
    agent: "interviewer",
    runId: input.runId,
    config: input.config,
    feature: "AI 模拟面试",
    promptVersion: interviewerPromptVersion(language),
    language,
    schema: interviewerOutputSchema,
    schemaName: "turn",
    schemaDescription: copy.schemaDescription,
    system: buildSystem(input.context, language),
    untrustedInputs: language === "en" ? "the candidate's answers, resume and job description" : "候选人的回答、简历和岗位描述",
    messages,
    tools,
    budget: { maxSteps: hasAsk ? TOOL_STEPS_WITH_ASK : TOOL_STEPS },
    hooks: {
      beforeTool: (call) => {
        if (call.toolName === PLAN_TOOL) return { allow: false, reason: copy.planRejected };
        return call.toolName === ASK_TOOL ? askVerdict(call.input, input.judge, copy) : undefined;
      },
    },
    // 有提问工具时契约在工具上：前 FREE_STEPS 步必须调工具但由模型选（查简历、翻方法书或直接提问），之后强制提问。
    // 模型若仍直接吐 JSON（服务商不支持指定工具时退化为 auto），rescue 按旧路径接住。
    ...(hasAsk
      ? {
          output: "none" as const,
          toolChoiceAt: (step: number) => (step >= FREE_STEPS ? ({ type: "tool", toolName: ASK_TOOL } as const) : "required"),
          rescue: rescueOutput,
        }
      : {}),
    providerOptions: { openai: { promptCacheKey: cacheKeyOf(input.runId) } },
    maxOutputTokens: 900,
    timeoutMs: TIMEOUT_MS,
  });
}
