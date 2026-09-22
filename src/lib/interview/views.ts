import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import type { Postmortem } from "./eval/postmortem";
import type { TraceAgentChain, TraceStep } from "./trace-steps";
import { stateEventsOf, type InterviewEvent } from "./events";
import { stateOf, type Action, type Signal } from "./state";
import type { TurnPhase, TurnResult } from "./turn";

export type ProgressSummary = { covered: number; quota: number };

/**
 * 面试中的视图（房间、trace）：纯数据进、组件吃的形状出。
 * 本地版从数据库行映射后调用（queries.ts），体验版从会话文档调用。
 */

export type ConversationMessage = {
  id: string;
  turnIndex: number;
  role: "interviewer" | "candidate";
  /** 面试官：say / closing / fallback；候选人：answer / control。 */
  kind: string;
  content: string;
  /** 面试官这句聊的材料 id、角度、动作；候选人这句的信号。体验版靠它们重建状态，本地版读事件。 */
  topic?: string | null;
  facet?: string | number | null;
  action?: Action | null;
  signal?: Signal | null;
  /** 面试官这回合写的笔记（给候选人看的"面试官思路"从它投影）；旧消息没有。 */
  notes?: string | null;
};

/** 体验版没有事件日志：从消息合成状态需要的事件。 */
export function eventsOfMessages(messages: ConversationMessage[]): InterviewEvent[] {
  return messages.map((message, seq) =>
    message.role === "candidate"
      ? ({ seq, type: "candidate_said", payload: { content: message.content, clientId: null, control: message.kind === "control" ? "hint" : null, composeMs: null, signal: message.signal ?? null }, runId: null, at: new Date(0) } as InterviewEvent)
      : ({ seq, type: "interviewer_said", payload: { content: message.content, kind: message.kind, topic: message.topic ?? null, facet: message.facet ?? null, action: message.action ?? null, signal: message.signal ?? null }, runId: null, at: new Date(0) } as InterviewEvent),
  );
}

export function progressSummaryOf(brief: Pick<InterviewBrief, "pace" | "areas">, events: InterviewEvent[]): ProgressSummary {
  const state = stateOf(brief, stateEventsOf(events));
  return { covered: state.materials.filter((item) => item.status !== "untouched").length, quota: state.materials.length };
}

/** 房间视图。候选人看得到进度与对话，看不到笔记与材料。 */
export type Conversation = {
  phase: TurnPhase;
  pace: InterviewBrief["pace"];
  startedAt: string | null;
  progress: ProgressSummary;
  messages: ConversationMessage[];
  /** 仅已完成的会话带：面试官最终版笔记，报告页展示"面试官当时的判断"。 */
  notes: string | null;
  coveredCount: number;
};

/** 进度：本地版从事件日志算好传进来；体验版从消息现算（面试官的消息带代码指派的材料 id）。 */
export function conversationView(input: { brief: InterviewBrief; status: string; startedAt: string | null; notes: string | null; messages: ConversationMessage[]; coveredCount?: number; progress?: ProgressSummary }): Conversation {
  const ended = input.status !== "in_progress";
  const progress = input.progress ?? progressSummaryOf(input.brief, eventsOfMessages(input.messages));
  return {
    phase: ended ? "ended" : input.messages.length === 0 ? "opening" : "running",
    pace: input.brief.pace,
    startedAt: input.startedAt,
    progress: { covered: progress.covered, quota: progress.quota },
    messages: input.messages,
    notes: input.status === "completed" ? input.notes : null,
    coveredCount: input.coveredCount ?? 0,
  };
}

/** 回合结果交给前端的形状（data-turn）。 */
export type TurnPayload = {
  newMessages: ConversationMessage[];
  phase: TurnPhase;
  progress: ProgressSummary;
  endedBy: TurnResult["endedBy"];
  /** 已经聊过的材料数（房间顶栏的进度提示）。 */
  coveredCount: number;
  /** 这回合写的笔记（体验版靠它保存最新版；本地版已落事件）。 */
  notes: string | null;
};

/** trace 页的一回合：候选人的话（带模型判的信号）、面试官的话（带动作）、这回合的笔记、开销。 */
export type TraceTurn = {
  turnIndex: number;
  candidate: { kind: string; content: string; composeMs: number | null; signal: string | null } | null;
  interviewer: { kind: string; content: string }[];
  /** 这回合写的笔记（整份）。 */
  notes: string | null;
  /** 有过重出或代码定动作。 */
  fallback: boolean;
  fallbackReasons: string[];
  /** 模型的动作。 */
  action: string | null;
  topic: string | null;
  facet: string | number | null;
  run: TraceRun | null;
};

export type TraceRun = { status: string; durationMs: number; totalTokens: number | null; cachedTokens: number | null; errorKind: string | null; /** 这回合的每一步（模型调用、工具调用……），G6。 */ steps: TraceStep[] };

export type Trace = {
  id: string;
  companyName: string;
  jobTitle: string;
  status: string;
  pace: InterviewBrief["pace"];
  /** 这场的配额：材料按顺序与预算。 */
  plan: { id: string; kind: InterviewBrief["areas"][number]["kind"]; reference: number }[];
  areas: { id: string; name: string; kind: InterviewBrief["areas"][number]["kind"] }[];
  competencies: { id: string; name: string }[];
  /** 自动复盘（从事件现算）；体验版没有事件，为 null。 */
  postmortem: Postmortem | null;
  rows: TraceTurn[];
  /** 面试后的 agent 链（评分、示范、评论员、档案），按步（G6）；体验版没有记账，为空。 */
  agents: TraceAgentChain[];
};

/** 一场的仪表（从 trace 行现算）：开销、降级、一句多问。 */
export type TraceDashboard = {
  turns: number;
  totalTokens: number;
  cachedTokens: number;
  cacheRate: number;
  p95Ms: number;
  fallbacks: number;
  live: { multiQuestionRate: number; avgChars: number };
};

const isMultiQuestion = (text: string) => (text.match(/[？?]/g) ?? []).length >= 2;
const rate = (hits: number, total: number) => (total === 0 ? 0 : hits / total);

export function traceDashboard(rows: TraceTurn[]): TraceDashboard {
  const runs = rows.flatMap((row) => (row.run ? [row.run] : []));
  const totalTokens = runs.reduce((sum, run) => sum + (run.totalTokens ?? 0), 0);
  const cachedTokens = runs.reduce((sum, run) => sum + (run.cachedTokens ?? 0), 0);
  const durations = runs.map((run) => run.durationMs).sort((left, right) => left - right);
  const said = rows.flatMap((row) => row.interviewer.filter((message) => message.kind === "say").map((message) => message.content));
  return {
    turns: rows.length,
    totalTokens,
    cachedTokens,
    cacheRate: rate(cachedTokens, totalTokens),
    p95Ms: durations.length === 0 ? 0 : durations[Math.max(0, Math.ceil(0.95 * durations.length) - 1)],
    fallbacks: rows.filter((row) => row.fallback).length,
    live: { multiQuestionRate: rate(said.filter(isMultiQuestion).length, said.length), avgChars: said.length === 0 ? 0 : Math.round(said.reduce((sum, text) => sum + text.length, 0) / said.length) },
  };
}

type TraceSource = { type: string; payload: Record<string, unknown>; runId: string | null };

/** 从事件日志拼 trace 行：一个面试官发言算一回合，之前的候选人发言与之后的笔记 / 进度 / 降级归到它。 */
export function traceTurns(events: TraceSource[], runs?: Map<string, TraceRun>): TraceTurn[] {
  const rows: TraceTurn[] = [];
  let pendingCandidate: TraceTurn["candidate"] = null;
  let pendingFallbacks: string[] = [];
  for (const item of events) {
    if (item.type === "candidate_said") {
      pendingCandidate = { kind: item.payload.control ? "control" : "answer", content: String(item.payload.content ?? ""), composeMs: typeof item.payload.composeMs === "number" ? item.payload.composeMs : null, signal: typeof item.payload.signal === "string" ? item.payload.signal : null };
      continue;
    }
    if (item.type === "fallback_used") {
      pendingFallbacks.push(String(item.payload.reason ?? ""));
      continue;
    }
    if (item.type === "interviewer_said") {
      rows.push({ turnIndex: rows.length, candidate: pendingCandidate, interviewer: [{ kind: String(item.payload.kind ?? "say"), content: String(item.payload.content ?? "") }], notes: null, fallback: pendingFallbacks.length > 0, fallbackReasons: pendingFallbacks, action: typeof item.payload.action === "string" ? item.payload.action : null, topic: typeof item.payload.topic === "string" ? item.payload.topic : null, facet: typeof item.payload.facet === "number" || typeof item.payload.facet === "string" ? item.payload.facet : null, run: item.runId ? (runs?.get(item.runId) ?? null) : null });
      pendingCandidate = null;
      pendingFallbacks = [];
      continue;
    }
    const current = rows.at(-1);
    if (!current) continue;
    if (item.type === "notes_written") current.notes = String(item.payload.content ?? "");
  }
  return rows;
}
