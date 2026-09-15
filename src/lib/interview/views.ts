import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { estimateClock, realTimeClock, type Clock } from "./clock";
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
};

/** 房间视图。候选人看得到时钟与对话，看不到笔记与材料。 */
export type Conversation = {
  phase: TurnPhase;
  pace: InterviewBrief["pace"];
  startedAt: string | null;
  clock: Clock;
  messages: ConversationMessage[];
  /** 仅已完成的会话带：面试官最后一份笔记，报告页展示"面试官当时的判断"。 */
  notebook: string | null;
  coveredCount: number;
};

/** realTime：语音模式，时钟按墙上时间（开场时刻起）。 */
export function conversationView(input: { brief: InterviewBrief; status: string; startedAt: string | null; totalMinutes: number; notebook: string; messages: ConversationMessage[]; coveredCount?: number; realTime?: boolean }): Conversation {
  const ended = input.status !== "in_progress";
  return {
    phase: ended ? "ended" : input.messages.length === 0 ? "opening" : "running",
    pace: input.brief.pace,
    startedAt: input.startedAt,
    clock: input.realTime ? realTimeClock(input.messages, input.totalMinutes, ended ? null : input.startedAt) : estimateClock(input.messages, input.totalMinutes),
    messages: input.messages,
    notebook: input.status === "completed" ? input.notebook : null,
    coveredCount: input.coveredCount ?? 0,
  };
}

/** 回合结果交给前端的形状（data-turn）。 */
export type TurnPayload = {
  newMessages: ConversationMessage[];
  phase: TurnPhase;
  clock: Clock;
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
  clock: { usedMinutes: number; totalMinutes: number } | null;
  fallback: boolean;
  /** 这回合之后评委给已结束的段打的分与估计器的更新。 */
  scored: { competencyId: string; difficulty: number; score: number; confidence: number; note: string }[];
  estimates: { competencyId: string; mean: number; confidence: number; samples: number }[];
  /** 评论员对这回合面试官那句的提醒。 */
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
  totalMinutes: number;
  areas: { id: string; name: string; kind: InterviewBrief["areas"][number]["kind"] }[];
  competencies: { id: string; name: string }[];
  /** 这场的开关：策略变体、影子变体、评论员。 */
  flags: { policy: string; shadow: string | null; critic: boolean };
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

/** 从事件日志拼 trace 行：一个面试官发言算一回合，之前的候选人发言与之后的笔记 / 时钟 / 降级归到它。 */
export function traceTurns(events: TraceSource[], runs?: Map<string, TraceRun>): TraceTurn[] {
  const rows: TraceTurn[] = [];
  let pendingCandidate: TraceTurn["candidate"] = null;
  for (const item of events) {
    if (item.type === "candidate_said") {
      pendingCandidate = { kind: item.payload.control ? "control" : "answer", content: String(item.payload.content ?? ""), composeMs: typeof item.payload.composeMs === "number" ? item.payload.composeMs : null };
      continue;
    }
    if (item.type === "interviewer_said") {
      rows.push({ turnIndex: rows.length, candidate: pendingCandidate, interviewer: [{ kind: String(item.payload.kind ?? "say"), content: String(item.payload.content ?? "") }], notebook: null, clock: null, fallback: false, scored: [], estimates: [], critic: null, shadow: null, run: item.runId ? (runs?.get(item.runId) ?? null) : null });
      pendingCandidate = null;
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
    if (item.type === "clock_tick") current.clock = { usedMinutes: Number(item.payload.usedMinutes), totalMinutes: Number(item.payload.totalMinutes) };
    if (item.type === "fallback_used") current.fallback = true;
    if (item.type === "segment_scored") current.scored.push({ competencyId: String(item.payload.competencyId), difficulty: Number(item.payload.difficulty), score: Number(item.payload.score), confidence: Number(item.payload.confidence), note: String(item.payload.note ?? "") });
    if (item.type === "critic_noted") current.critic = { rule: String(item.payload.rule ?? ""), text: String(item.payload.text ?? "") };
    if (item.type === "estimate_updated") current.estimates.push({ competencyId: String(item.payload.competencyId), mean: Number(item.payload.mean), confidence: Number(item.payload.confidence), samples: Number(item.payload.samples) });
  }
  return rows;
}
