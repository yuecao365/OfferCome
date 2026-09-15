import { prisma } from "@/lib/db";
import { parseStoredBrief } from "@/lib/mock-interviews/brief/brief";

import { parseEventRow, type InterviewEvent } from "../events";
import type { RunFact, SegmentFact, SessionFacts } from "./metrics";

/**
 * 从库里装一场的事实：事件日志 + 分段投影 + 面试官的模型开销。指标只看这三样。
 * 阶段 A 的分段来自旧系统的线程表；阶段 C 起换成整理员的分段，这里是唯一要改的地方。
 */
export async function loadSessionFacts(sessionId: string): Promise<SessionFacts> {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: {
      events: { orderBy: { seq: "asc" } },
      threads: { orderBy: { openedAtTurn: "asc" }, include: { messages: { select: { role: true } } } },
    },
  });
  if (!session) throw new Error(`会话 ${sessionId} 不存在`);
  const brief = parseStoredBrief(session.briefJson);
  const projectOf = new Map(brief?.areas.map((area) => [area.id, area.projectId] as const) ?? []);
  const events = session.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  const segments: SegmentFact[] = session.threads.map((thread) => ({
    kind: thread.kind === "project" || thread.kind === "scenario" ? thread.kind : "quick",
    areaId: thread.areaId,
    projectId: thread.areaId ? (projectOf.get(thread.areaId) ?? null) : null,
    depth: thread.depth,
    answered: thread.messages.some((message) => message.role === "candidate"),
  }));
  const runs: RunFact[] = (
    await prisma.agentRun.findMany({
      where: { runId: { startsWith: `turn:${sessionId}:` }, event: "model_call", agent: "interviewer" },
      select: { runId: true, durationMs: true, inputTokens: true, cachedTokens: true, outputTokens: true },
    })
  ).map((run) => ({ runId: run.runId, durationMs: run.durationMs, inputTokens: run.inputTokens ?? 0, cachedTokens: run.cachedTokens ?? 0, outputTokens: run.outputTokens ?? 0 }));
  // 重建后预算是时间盒而不是回合数：回合预算指标不再适用（守住预算恒为真），时间盒由 clock_tick / ended 事件体现。
  return { sessionId, turnsTotal: null, events, segments, runs };
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
