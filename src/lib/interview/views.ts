import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import type { Postmortem } from "./eval/postmortem";
import { planQuota, progressOf, type ProgressSummary } from "./progress";
import type { TurnPhase, TurnResult } from "./turn";

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
  /** 面试官这句聊的材料 id 与角度（代码指派；体验版靠它重建状态，本地版读事件）。 */
  topic?: string | null;
  facet?: number | null;
  doneFacet?: number | null;
};

/** 房间视图。候选人看得到进度与对话，看不到笔记与材料。 */
export type Conversation = {
  phase: TurnPhase;
  pace: InterviewBrief["pace"];
  startedAt: string | null;
  progress: ProgressSummary;
  messages: ConversationMessage[];
  /** 仅已完成的会话带：面试官最后一份笔记，报告页展示"面试官当时的判断"。 */
  notebook: string | null;
  coveredCount: number;
};

/** 进度：本地版从事件日志算好传进来；体验版从消息现算（面试官的消息带代码指派的材料 id）。 */
export function conversationView(input: { brief: InterviewBrief; status: string; startedAt: string | null; notebook: string; messages: ConversationMessage[]; coveredCount?: number; progress?: ProgressSummary }): Conversation {
  const ended = input.status !== "in_progress";
  const progress = input.progress ?? progressOf(planQuota(input.brief), input.messages.map((message, seq) => ({ seq, role: message.role, content: message.content, kind: message.kind, control: null, topic: message.topic ?? null, facet: message.facet ?? null, doneFacet: message.doneFacet ?? null })));
  return {
    phase: ended ? "ended" : input.messages.length === 0 ? "opening" : "running",
    pace: input.brief.pace,
    startedAt: input.startedAt,
    progress: { covered: progress.covered, quota: progress.quota },
    messages: input.messages,
    notebook: input.status === "completed" ? input.notebook : null,
    coveredCount: input.coveredCount ?? 0,
  };
}

/** 回合结果交给前端的形状（data-turn）。 */
export type TurnPayload = {
  newMessages: ConversationMessage[];
  phase: TurnPhase;
  progress: ProgressSummary;
  endedBy: TurnResult["endedBy"];
  /** 标注器认为已经聊过的材料数（房间顶栏的进度提示）。 */
  coveredCount: number;
};

/** trace 页的一回合：候选人的话、面试官的话、这回合写的笔记、开销。 */
export type TraceTurn = {
  turnIndex: number;
  candidate: { kind: string; content: string; composeMs: number | null } | null;
  interviewer: { kind: string; content: string }[];
  notebook: string | null;
  progress: { covered: number; quota: number; budgetLeft: number } | null;
  fallback: boolean;
  /** 这回合之后评委给已结束的段打的分与估计器的更新。 */
  scored: { competencyId: string; difficulty: number; score: number; confidence: number; note: string }[];
  estimates: { competencyId: string; mean: number; confidence: number; samples: number }[];
  /** 代码给这回合的建议。 */
  move: { move: string; reason: string } | null;
  /** 这句聊的材料 id 与角度（代码指派）；模型说讲透了的角度。 */
  topic: string | null;
  facet: number | null;
  doneFacet: number | null;
  /** 评论员对这回合面试官那句的判断（实验层）。 */
  critic: { rule: string; text: string } | null;
  /** 影子变体在同一张现场卡上说的话与评论员的判断。 */
  shadow: { variant: string; say: string; rule: string | null } | null;
  run: TraceRun | null;
};

export type TraceRun = { status: string; durationMs: number; totalTokens: number | null; cachedTokens: number | null; errorKind: string | null };

export type Trace = {
  id: string;
  companyName: string;
  jobTitle: string;
  status: string;
  pace: InterviewBrief["pace"];
  /** 这场的配额：材料按顺序与预算。 */
  plan: { id: string; kind: InterviewBrief["areas"][number]["kind"]; budget: number }[];
  areas: { id: string; name: string; kind: InterviewBrief["areas"][number]["kind"] }[];
  competencies: { id: string; name: string }[];
  /** 这场的开关：策略变体、影子变体、实验层。 */
  flags: { policy: string; shadow: string | null; lab: boolean };
  /** 自动复盘（从事件现算）；体验版没有事件，为 null。 */
  postmortem: Postmortem | null;
  rows: TraceTurn[];
};

/** 一场的仪表（从 trace 行现算）：开销、降级、评论员；有影子时真身 vs 影子。 */
export type TraceDashboard = {
  turns: number;
  totalTokens: number;
  cachedTokens: number;
  cacheRate: number;
  p95Ms: number;
  fallbacks: number;
  criticNotes: number;
  live: { multiQuestionRate: number; avgChars: number };
  shadow: { variant: string; turns: number; multiQuestionRate: number; criticRate: number; avgChars: number } | null;
};

const isMultiQuestion = (text: string) => (text.match(/[？?]/g) ?? []).length >= 2;
const rate = (hits: number, total: number) => (total === 0 ? 0 : hits / total);

export function traceDashboard(rows: TraceTurn[]): TraceDashboard {
  const runs = rows.flatMap((row) => (row.run ? [row.run] : []));
  const totalTokens = runs.reduce((sum, run) => sum + (run.totalTokens ?? 0), 0);
  const cachedTokens = runs.reduce((sum, run) => sum + (run.cachedTokens ?? 0), 0);
  const durations = runs.map((run) => run.durationMs).sort((left, right) => left - right);
  const said = rows.flatMap((row) => row.interviewer.filter((message) => message.kind === "say").map((message) => message.content));
  const shadows = rows.flatMap((row) => (row.shadow ? [row.shadow] : []));
  return {
    turns: rows.length,
    totalTokens,
    cachedTokens,
    cacheRate: rate(cachedTokens, totalTokens),
    p95Ms: durations.length === 0 ? 0 : durations[Math.max(0, Math.ceil(0.95 * durations.length) - 1)],
    fallbacks: rows.filter((row) => row.fallback).length,
    criticNotes: rows.filter((row) => row.critic).length,
    live: { multiQuestionRate: rate(said.filter(isMultiQuestion).length, said.length), avgChars: said.length === 0 ? 0 : Math.round(said.reduce((sum, text) => sum + text.length, 0) / said.length) },
    shadow:
      shadows.length === 0
        ? null
        : {
            variant: shadows[0].variant,
            turns: shadows.length,
            multiQuestionRate: rate(shadows.filter((item) => isMultiQuestion(item.say)).length, shadows.length),
            criticRate: rate(shadows.filter((item) => item.rule !== null).length, shadows.length),
            avgChars: Math.round(shadows.reduce((sum, item) => sum + item.say.length, 0) / shadows.length),
          },
  };
}

type TraceSource = { type: string; payload: Record<string, unknown>; runId: string | null };

/** 从事件日志拼 trace 行：一个面试官发言算一回合，之前的候选人发言与之后的笔记 / 进度 / 降级归到它。 */
export function traceTurns(events: TraceSource[], runs?: Map<string, TraceRun>): TraceTurn[] {
  const rows: TraceTurn[] = [];
  let pendingCandidate: TraceTurn["candidate"] = null;
  let pendingMove: TraceTurn["move"] = null;
  for (const item of events) {
    if (item.type === "candidate_said") {
      pendingCandidate = { kind: item.payload.control ? "control" : "answer", content: String(item.payload.content ?? ""), composeMs: typeof item.payload.composeMs === "number" ? item.payload.composeMs : null };
      continue;
    }
    if (item.type === "move_decided") {
      pendingMove = { move: String(item.payload.move ?? ""), reason: String(item.payload.reason ?? "") };
      continue;
    }
    if (item.type === "interviewer_said") {
      rows.push({ turnIndex: rows.length, candidate: pendingCandidate, interviewer: [{ kind: String(item.payload.kind ?? "say"), content: String(item.payload.content ?? "") }], notebook: null, progress: null, fallback: false, move: pendingMove, topic: typeof item.payload.topic === "string" ? item.payload.topic : null, facet: typeof item.payload.facet === "number" ? item.payload.facet : null, doneFacet: typeof item.payload.doneFacet === "number" ? item.payload.doneFacet : null, scored: [], estimates: [], critic: null, shadow: null, run: item.runId ? (runs?.get(item.runId) ?? null) : null });
      pendingCandidate = null;
      pendingMove = null;
      continue;
    }
    if (item.type === "shadow_said") {
      const row = rows[Number(item.payload.turnIndex)];
      if (row) row.shadow = { variant: String(item.payload.variant ?? ""), say: String(item.payload.say ?? ""), rule: typeof item.payload.rule === "string" ? item.payload.rule : null };
      continue;
    }
    const current = rows.at(-1);
    if (!current) continue;
    if (item.type === "notebook_written") current.notebook = String(item.payload.text ?? "");
    if (item.type === "progress_tick") current.progress = { covered: Number(item.payload.covered), quota: Number(item.payload.quota), budgetLeft: Number(item.payload.budgetLeft) };
    if (item.type === "fallback_used") current.fallback = true;
    if (item.type === "segment_scored") current.scored.push({ competencyId: String(item.payload.competencyId), difficulty: Number(item.payload.difficulty), score: Number(item.payload.score), confidence: Number(item.payload.confidence), note: String(item.payload.note ?? "") });
    if (item.type === "critic_noted") current.critic = { rule: String(item.payload.rule ?? ""), text: String(item.payload.text ?? "") };
    if (item.type === "estimate_updated") current.estimates.push({ competencyId: String(item.payload.competencyId), mean: Number(item.payload.mean), confidence: Number(item.payload.confidence), samples: Number(item.payload.samples) });
  }
  return rows;
}
