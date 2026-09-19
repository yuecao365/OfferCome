import { questionSimilarity } from "@/lib/text/similarity";

import { estimate, estimatePairs, pearson, type Competency, type Observation } from "../estimator";
import { endedBy, isHelpRequest, transcriptOf, type InterviewEvent, type TranscriptLine } from "../events";

/**
 * 一场面试的指标（interview-system-design.md §8）：全部从事件日志加两份投影算出来，
 * 不看模型的记账。阶段 A 里"聊了什么"来自旧系统的线程表；阶段 C 起来自整理员的分段，
 * 输入形状不变（SegmentFact）。
 */

/** 一段问答的事实：种类、对应材料、所属项目、追问轮数；阶段 D 起还有考的能力、答到第几层与事后评分。 */
export type SegmentFact = {
  kind: "project" | "quick" | "scenario";
  areaId: string | null;
  projectId: string | null;
  depth: number;
  answered: boolean;
  startSeq: number;
  endSeq: number;
  competencyId?: string | null;
  difficulty?: number | null;
  score?: number | null;
  lowConfidence?: boolean;
};

/** 一次模型调用的开销（AgentRun）。 */
export type RunFact = { runId: string; durationMs: number; inputTokens: number; cachedTokens: number; outputTokens: number };
/** 一段评分的轨迹（G2，从 AgentRun 行算）：走了几步、调了几次工具、几次无效（未知 / 失败 / 被 hook 拒绝）、有没有触顶预算、核对出几条不一致、工具改了多少分。 */
export type EvaluationRunFact = { steps: number; toolCalls: number; invalidCalls: number; budgetHit: boolean; resumeInconsistent: number; toolShift: number | null };

export type SessionFacts = {
  sessionId: string;
  /** 预算：回合数（旧系统）或分钟（新系统），两者只填一个。 */
  turnsTotal: number | null;
  events: InterviewEvent[];
  segments: SegmentFact[];
  /** 面试官的模型调用（不含评分等事后调用）。 */
  runs: RunFact[];
  /** 每段评分的轨迹；旧场次没有。 */
  evaluationRuns?: EvaluationRunFact[];
  /** 岗位能力清单（估计器用）；没有为空。 */
  competencies?: Competency[];
  /** 模拟候选人的能力真值（只有模拟器有）。 */
  truth?: { competencyId: string; level: number }[];
};

export type SessionMetrics = {
  sessionId: string;
  interviewerTurns: number;
  candidateTurns: number;
  asides: number;
  endedBy: "interviewer" | "candidate" | "budget" | "breaker" | null;
  /** 面试官说的回合数（不含答疑）没超预算。 */
  budgetKept: boolean;
  projectsCovered: number;
  /** 每个聊过的项目摸了几个面（平均）。 */
  facesPerProject: number;
  quickCount: number;
  scenarioAsked: boolean;
  scenarioAnswered: boolean;
  /** 项目段的平均追问轮数。 */
  projectProbeDepth: number;
  /** 与前面某句几乎一样的提问数。 */
  repeatedQuestions: number;
  helpRequests: number;
  /** 求助 / 澄清之后面试官没有换题（仍在同一段）的比例；没求助为 null。 */
  helpHandledRate: number | null;
  fallbacks: number;
  /** 面试官这场查资料的次数（tool_called 事件：查简历原文、查技能包）。 */
  interviewerToolCalls: number;
  /** 面试官提问里两个以上问号的比例（"一句一个要点"的反面）。 */
  multiQuestionRate: number;
  /** 按种类的时间占比（从分段内的字数估）：项目 / 基础题 / 场景题。 */
  timeShare: { project: number; quick: number; scenario: number };
  tokens: { input: number; cached: number; output: number; cacheRate: number };
  latencyMs: { p50: number; p95: number };
  /** 评分 agent 的轨迹（G2）：每段平均步数与工具调用数、无效调用率、预算触顶率、简历核对不一致条数、工具改分的平均绝对值（没调工具为 null）。 */
  evaluationSteps: number | null;
  evaluationToolCalls: number | null;
  invalidToolCallRate: number | null;
  budgetHitRate: number | null;
  resumeInconsistencies: number | null;
  toolShift: number | null;
  /** 事后的能力估计与真值的平均绝对误差（0–1；只有模拟器有真值，只算测过的能力；没测过为 null）。 */
  offlineError: number | null;
  /** （估计，真值）对：一场里真值常常相同（同一画像），相关要跨场合并算。 */
  estimatePairs: [number, number][];
};

const isMultiQuestion = (text: string) => (text.match(/[？?]/g) ?? []).length >= 2;

export function evaluationTrajectoryMetrics(runs: EvaluationRunFact[]): Pick<SessionMetrics, "evaluationSteps" | "evaluationToolCalls" | "invalidToolCallRate" | "budgetHitRate" | "resumeInconsistencies" | "toolShift"> {
  if (runs.length === 0) return { evaluationSteps: null, evaluationToolCalls: null, invalidToolCallRate: null, budgetHitRate: null, resumeInconsistencies: null, toolShift: null };
  const calls = runs.reduce((sum, run) => sum + run.toolCalls, 0);
  const shifts = runs.flatMap((run) => (run.toolShift === null ? [] : [run.toolShift]));
  return {
    evaluationSteps: runs.reduce((sum, run) => sum + run.steps, 0) / runs.length,
    evaluationToolCalls: calls / runs.length,
    invalidToolCallRate: calls === 0 ? 0 : runs.reduce((sum, run) => sum + run.invalidCalls, 0) / calls,
    budgetHitRate: runs.filter((run) => run.budgetHit).length / runs.length,
    resumeInconsistencies: runs.reduce((sum, run) => sum + run.resumeInconsistent, 0),
    toolShift: shifts.length === 0 ? null : shifts.reduce((sum, value) => sum + value, 0) / shifts.length,
  };
}

/** 事后能力估计准不准：切段与评分折成测量，估计与模拟器真值比。 */
export function estimatorMetrics(facts: SessionFacts): Pick<SessionMetrics, "offlineError" | "estimatePairs"> {
  const offline: Observation[] = facts.segments.flatMap((segment) =>
    segment.competencyId && segment.difficulty != null && segment.score != null ? [{ competencyId: segment.competencyId, difficulty: segment.difficulty, score: segment.score, confidence: segment.lowConfidence ? 0.5 : 1 }] : [],
  );
  const pairs = facts.truth ? estimatePairs(estimate(facts.competencies ?? [], offline), facts.truth) : [];
  return { offlineError: pairs.length === 0 ? null : pairs.reduce((sum, [mean, level]) => sum + Math.abs(mean - level), 0) / pairs.length, estimatePairs: pairs };
}

const REPEAT_SIMILARITY = 0.6;

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(ratio * sorted.length) - 1)];
}

/** 面试官的一句是不是在重复前面说过的话（问法几乎一样）。 */
export function repeatedQuestionCount(transcript: TranscriptLine[]): number {
  const said: string[] = [];
  let repeats = 0;
  for (const line of transcript) {
    if (line.role !== "interviewer" || line.kind === "closing" || line.kind === "aside") continue;
    if (said.some((previous) => questionSimilarity(previous, line.content) >= REPEAT_SIMILARITY)) repeats += 1;
    said.push(line.content);
  }
  return repeats;
}

/**
 * 求助之后有没有被换题：面试官的下一句还在同一段里（按整理员的分段）。没有分段时按消息 kind 兜底（closing 算换题）。
 */
export function helpHandling(transcript: TranscriptLine[], segments: SegmentFact[] = []): { requests: number; handled: number } {
  const segmentOf = (seq: number) => segments.findIndex((segment) => seq >= segment.startSeq && seq <= segment.endSeq);
  let requests = 0;
  let handled = 0;
  for (let index = 0; index < transcript.length; index += 1) {
    const line = transcript[index];
    if (!isHelpRequest(line)) continue;
    requests += 1;
    const next = transcript.slice(index + 1).find((item) => item.role === "interviewer");
    if (!next || next.kind === "closing") continue;
    if (segments.length === 0) {
      if (next.kind !== "question") handled += 1;
      continue;
    }
    const before = segmentOf(line.seq);
    if (before >= 0 && segmentOf(next.seq) === before) handled += 1;
  }
  return { requests, handled };
}

export function sessionMetrics(facts: SessionFacts): SessionMetrics {
  const transcript = transcriptOf(facts.events);
  const interviewerLines = transcript.filter((line) => line.role === "interviewer");
  const asides = interviewerLines.filter((line) => line.kind === "aside").length;
  const counted = interviewerLines.length - asides;
  const projects = new Map<string, Set<string>>();
  for (const segment of facts.segments) {
    if (segment.kind !== "project" || !segment.projectId) continue;
    const faces = projects.get(segment.projectId) ?? new Set<string>();
    if (segment.areaId) faces.add(segment.areaId);
    projects.set(segment.projectId, faces);
  }
  const projectSegments = facts.segments.filter((segment) => segment.kind === "project");
  const scenario = facts.segments.filter((segment) => segment.kind === "scenario");
  const help = helpHandling(transcript, facts.segments);
  const questions = interviewerLines.filter((line) => line.kind !== "closing" && line.kind !== "aside");
  const multi = questions.filter((line) => isMultiQuestion(line.content)).length;
  const chars = { project: 0, quick: 0, scenario: 0 };
  for (const segment of facts.segments) {
    chars[segment.kind] += transcript.filter((line) => line.seq >= segment.startSeq && line.seq <= segment.endSeq).reduce((sum, line) => sum + line.content.length, 0);
  }
  const totalChars = chars.project + chars.quick + chars.scenario;
  const input = facts.runs.reduce((sum, run) => sum + run.inputTokens, 0);
  const cached = facts.runs.reduce((sum, run) => sum + run.cachedTokens, 0);
  const output = facts.runs.reduce((sum, run) => sum + run.outputTokens, 0);
  const latencies = facts.runs.map((run) => run.durationMs);
  return {
    sessionId: facts.sessionId,
    interviewerTurns: counted,
    candidateTurns: transcript.filter((line) => line.role === "candidate").length,
    asides,
    endedBy: endedBy(facts.events),
    budgetKept: facts.turnsTotal === null || counted <= facts.turnsTotal,
    projectsCovered: projects.size,
    facesPerProject: projects.size === 0 ? 0 : [...projects.values()].reduce((sum, faces) => sum + faces.size, 0) / projects.size,
    quickCount: facts.segments.filter((segment) => segment.kind === "quick").length,
    scenarioAsked: scenario.length > 0,
    scenarioAnswered: scenario.some((segment) => segment.answered),
    projectProbeDepth: projectSegments.length === 0 ? 0 : projectSegments.reduce((sum, segment) => sum + segment.depth, 0) / projectSegments.length,
    repeatedQuestions: repeatedQuestionCount(transcript),
    helpRequests: help.requests,
    helpHandledRate: help.requests === 0 ? null : help.handled / help.requests,
    fallbacks: facts.events.filter((item) => item.type === "fallback_used").length,
    interviewerToolCalls: facts.events.filter((item) => item.type === "tool_called").length,
    multiQuestionRate: questions.length === 0 ? 0 : multi / questions.length,
    timeShare: totalChars === 0 ? { project: 0, quick: 0, scenario: 0 } : { project: chars.project / totalChars, quick: chars.quick / totalChars, scenario: chars.scenario / totalChars },
    tokens: { input, cached, output, cacheRate: input === 0 ? 0 : cached / input },
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    ...evaluationTrajectoryMetrics(facts.evaluationRuns ?? []),
    ...estimatorMetrics(facts),
  };
}

/** 一组会话的汇总：数值取均值，布尔取比例，null 跳过。 */
export type MetricSummary = Record<string, number | null>;

const SUMMARY_KEYS = [
  "interviewerTurns",
  "asides",
  "budgetKept",
  "projectsCovered",
  "facesPerProject",
  "quickCount",
  "scenarioAsked",
  "scenarioAnswered",
  "projectProbeDepth",
  "repeatedQuestions",
  "helpRequests",
  "helpHandledRate",
  "fallbacks",
  "interviewerToolCalls",
  "multiQuestionRate",
  "offlineError",
  "evaluationSteps",
  "evaluationToolCalls",
  "invalidToolCallRate",
  "budgetHitRate",
  "resumeInconsistencies",
  "toolShift",
] as const;

export function summarize(list: SessionMetrics[]): MetricSummary {
  const summary: MetricSummary = { sessions: list.length };
  for (const key of SUMMARY_KEYS) {
    const values = list.map((item) => item[key]).filter((value): value is number | boolean => value !== null).map((value) => (typeof value === "boolean" ? Number(value) : value));
    summary[key] = values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  for (const kind of ["project", "quick", "scenario"] as const) summary[`timeShare_${kind}`] = list.length === 0 ? null : list.reduce((sum, item) => sum + item.timeShare[kind], 0) / list.length;
  const input = list.reduce((sum, item) => sum + item.tokens.input, 0);
  summary.inputTokensPerSession = list.length === 0 ? null : input / list.length;
  summary.outputTokensPerSession = list.length === 0 ? null : list.reduce((sum, item) => sum + item.tokens.output, 0) / list.length;
  summary.cacheRate = input === 0 ? null : list.reduce((sum, item) => sum + item.tokens.cached, 0) / input;
  summary.latencyP95Ms = list.length === 0 ? null : percentile(list.map((item) => item.latencyMs.p95), 0.5);
  summary.offlineCorrelation = pearson(list.flatMap((item) => item.estimatePairs));
  return summary;
}

const LABELS: Record<string, string> = {
  sessions: "场次",
  interviewerTurns: "面试官回合（不含答疑）",
  asides: "答疑句数",
  budgetKept: "守住预算的比例",
  projectsCovered: "聊到的项目数",
  facesPerProject: "每项目摸的面数",
  quickCount: "基础题数",
  scenarioAsked: "问了场景题的比例",
  scenarioAnswered: "场景题答上的比例",
  projectProbeDepth: "项目段平均追问轮数",
  repeatedQuestions: "重复提问数",
  helpRequests: "求助次数",
  helpHandledRate: "求助后不换题的比例",
  fallbacks: "代码接话次数",
  interviewerToolCalls: "面试官查资料次数",
  multiQuestionRate: "一句多问的比例",
  offlineError: "事后估计与真值的平均误差",
  evaluationSteps: "评分每段平均步数",
  evaluationToolCalls: "评分每段工具调用数",
  invalidToolCallRate: "评分无效工具调用率",
  budgetHitRate: "评分预算触顶率",
  resumeInconsistencies: "简历核对不一致条数",
  toolShift: "工具改分的平均绝对值",
  offlineCorrelation: "事后估计与真值的相关（跨场合并）",
  timeShare_project: "时间占比：项目",
  timeShare_quick: "时间占比：基础题",
  timeShare_scenario: "时间占比：场景题",
  inputTokensPerSession: "每场输入 token",
  outputTokensPerSession: "每场输出 token",
  cacheRate: "缓存命中率",
  latencyP95Ms: "回合 p95 延迟（ms，取各场中位）",
};

export function renderSummaryTable(columns: { name: string; summary: MetricSummary }[]): string {
  const keys = Object.keys(columns[0]?.summary ?? {});
  const header = `| 指标 | ${columns.map((column) => column.name).join(" | ")} |`;
  const divider = `|---|${columns.map(() => "---").join("|")}|`;
  const rows = keys.map((key) => `| ${LABELS[key] ?? key} | ${columns.map((column) => format(column.summary[key])).join(" | ")} |`);
  return [header, divider, ...rows].join("\n");
}

function format(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}
