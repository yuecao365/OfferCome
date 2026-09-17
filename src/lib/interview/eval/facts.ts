import { prisma } from "@/lib/db";
import { parseStoredBrief } from "@/lib/mock-interviews/brief/brief";
import { competenciesOf } from "@/lib/mock-interviews/context";

import { parseEventRow, type InterviewEvent } from "../events";
import { sessionFlags } from "../flags";
import type { EvaluationRunFact, RunFact, SegmentFact, SessionFacts } from "./metrics";

/**
 * 从库里装一场的事实：事件日志 + 分段投影（带事后评分）+ 面试官的模型开销 + 岗位能力清单。指标只看这些。
 * 分段来自整理员写的线程投影（阶段 C 起）；truth 是模拟候选人的能力真值（阶段 D 的估计器对照）。
 */
export async function loadSessionFacts(sessionId: string, truth?: { competencyId: string; level: number }[]): Promise<SessionFacts> {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: {
      events: { orderBy: { seq: "asc" } },
      threads: { orderBy: { startSeq: "asc" } },
    },
  });
  if (!session) throw new Error(`会话 ${sessionId} 不存在`);
  const brief = parseStoredBrief(session.briefJson);
  const projectOf = new Map(brief?.areas.map((area) => [area.id, area.projectId] as const) ?? []);
  const events = session.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  const evaluations = await prisma.interviewQuestionEvaluation.findMany({
    where: { interviewQuestionId: { in: session.threads.flatMap((thread) => (thread.questionId ? [thread.questionId] : [])) } },
    select: { interviewQuestionId: true, score: true, lowConfidence: true },
  });
  const evaluationOf = new Map(evaluations.map((item) => [item.interviewQuestionId, item]));
  const segments: SegmentFact[] = session.threads.map((thread) => ({
    kind: thread.kind === "project" || thread.kind === "scenario" ? thread.kind : "quick",
    areaId: thread.areaId,
    projectId: thread.areaId ? (projectOf.get(thread.areaId) ?? null) : null,
    depth: thread.depth,
    answered: thread.verdict !== "skipped",
    startSeq: thread.startSeq,
    endSeq: thread.endSeq,
    competencyId: thread.competencyId,
    difficulty: thread.difficulty,
    score: thread.questionId ? (evaluationOf.get(thread.questionId)?.score ?? null) : null,
    lowConfidence: thread.questionId ? (evaluationOf.get(thread.questionId)?.lowConfidence ?? false) : false,
  }));
  const runs: RunFact[] = (
    await prisma.agentRun.findMany({
      where: { runId: { startsWith: `turn:${sessionId}:` }, event: "model_call", agent: "interviewer" },
      select: { runId: true, durationMs: true, inputTokens: true, cachedTokens: true, outputTokens: true },
    })
  ).map((run) => ({ runId: run.runId, durationMs: run.durationMs, inputTokens: run.inputTokens ?? 0, cachedTokens: run.cachedTokens ?? 0, outputTokens: run.outputTokens ?? 0 }));
  const evaluationRuns = await loadEvaluationRuns(session.threads.flatMap((thread) => (thread.questionId ? [thread.questionId] : [])));
  // 重建后预算是时间盒而不是回合数：回合预算指标不再适用（守住预算恒为真），时间盒由 clock_tick / ended 事件体现。
  const flags = sessionFlags(session.flagsJson);
  return { sessionId, turnsTotal: null, events, segments, runs, evaluationRuns, competencies: competenciesOf(session.contextSnapshotJson), variant: flags.policy ?? "v2", shadowVariant: flags.shadow, ...(truth ? { truth } : {}) };
}

/** 每段评分的轨迹：带工具那次采样的 runId 是 eval:<questionId>（对照采样带 :b，不算）；步数与工具调用数在 selection 行的指标里，无效调用与触顶从循环事件行数。 */
export async function loadEvaluationRuns(questionIds: string[]): Promise<EvaluationRunFact[]> {
  if (questionIds.length === 0) return [];
  const rows = await prisma.agentRun.findMany({
    where: { agent: "question_evaluation", runId: { in: questionIds.map((id) => `eval:${id}`) } },
    select: { runId: true, event: true, status: true, metricsJson: true },
  });
  const byRun = new Map<string, typeof rows>();
  for (const row of rows) byRun.set(row.runId, [...(byRun.get(row.runId) ?? []), row]);
  return [...byRun.values()].flatMap((group) => {
    const selection = group.find((row) => row.event === "selection");
    if (!selection) return [];
    const metrics = (JSON.parse(selection.metricsJson ?? "{}") as Record<string, number>) ?? {};
    return [{
      steps: metrics.steps ?? 1,
      toolCalls: metrics.toolCalls ?? 0,
      invalidCalls: group.filter((row) => row.event === "tool_result" && row.status === "failed").length,
      budgetHit: group.some((row) => row.event === "budget_exceeded"),
      resumeInconsistent: metrics.resumeInconsistent ?? 0,
      toolShift: metrics.toolShift === undefined || metrics.toolShift < 0 ? null : metrics.toolShift,
    }];
  });
}

/** 逐字稿投影与消息表对账：事件日志是否完整地记下了双方说的话。 */
export async function transcriptParity(sessionId: string): Promise<{ eventLines: number; messageRows: number; mismatches: string[] }> {
  const [events, messages] = await Promise.all([
    prisma.interviewEvent.findMany({ where: { sessionId, type: { in: ["candidate_said", "interviewer_said"] } }, orderBy: { seq: "asc" } }),
    prisma.mockInterviewMessage.findMany({ where: { sessionId }, orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }] }),
  ]);
  const said = events.map((row) => (JSON.parse(row.payloadJson) as { content: string }).content);
  const mismatches: string[] = [];
  messages.forEach((message, index) => {
    if (said[index] !== message.content) mismatches.push(`#${index} ${message.role}/${message.kind}：消息表「${message.content.slice(0, 30)}」 事件「${(said[index] ?? "").slice(0, 30)}」`);
  });
  return { eventLines: said.length, messageRows: messages.length, mismatches };
}
