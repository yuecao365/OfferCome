import "server-only";

import { after } from "next/server";

import { prisma } from "@/lib/db";
import { parseStoredBrief } from "@/lib/mock-interviews/brief/brief";
import { competenciesOf } from "@/lib/mock-interviews/context";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { estimate, observationsFromEvents } from "./estimator";
import { appendEvents, event, parseEventRow, transcriptOf, type InterviewEvent, type NewEvent } from "./events";
import { closedSegments, judgeSegment } from "./judge";
import { labelingDue, labelRecent } from "./labeler";

/**
 * 面试中的后台任务（响应返回后跑）：标注器每两次交换标一次（label_added）；标出一段结束时在线评委给那段打分
 * （segment_scored），估计器随之更新（estimate_updated）。与下一回合的落库可能同时分配 seq（唯一约束冲突）：
 * 冲突就放弃这次，下次再标 / 再评——评过与否以事件为准，不会重复。
 */

async function loadLive(sessionId: string) {
  const loaded = await prisma.mockInterviewSession.findUnique({ where: { id: sessionId }, include: { events: { orderBy: { seq: "asc" } } } });
  if (!loaded || loaded.status !== "in_progress") return null;
  const brief = parseStoredBrief(loaded.briefJson);
  if (!brief) return null;
  const events = loaded.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  return { brief, events, competencies: competenciesOf(loaded.contextSnapshotJson) };
}

export function scheduleLabeling(sessionId: string): void {
  after(async () => {
    try {
      const live = await loadLive(sessionId);
      if (!live) return;
      const transcript = transcriptOf(live.events);
      if (labelingDue(transcript, live.events)) {
        const labels = await labelRecent({ runId: `label:${sessionId}:${transcript.length}`, config: await getAiTaskConfig("text"), brief: live.brief, transcript, events: live.events });
        await appendEvents(prisma, sessionId, labels);
      }
    } catch (error) {
      console.warn("[interview] 标注器这次没跑成，下次再标。", error instanceof Error ? error.message : error);
    }
    try {
      await judgeClosedSegments(sessionId);
    } catch (error) {
      console.warn("[interview] 评委这次没跑成，下次再评。", error instanceof Error ? error.message : error);
    }
  });
}

/** 标签里已结束、还没评分的段：逐段评分，每段评完立刻落事件（连同受影响能力的新估计）。 */
async function judgeClosedSegments(sessionId: string): Promise<void> {
  const live = await loadLive(sessionId);
  if (!live || live.competencies.length === 0) return;
  const transcript = transcriptOf(live.events);
  const config = await getAiTaskConfig("text");
  let events = live.events;
  for (const segment of closedSegments(events, transcript[0]?.seq ?? null)) {
    const scored = await judgeSegment({ runId: `judge:${sessionId}:${segment.startSeq}`, config, brief: live.brief, competencies: live.competencies, transcript, segment });
    if (!scored) continue;
    const next = [...events, { ...scored, seq: -1, at: new Date() } as InterviewEvent];
    const updated = estimate(live.competencies, observationsFromEvents(next)).find((item) => item.competencyId === scored.payload.competencyId);
    const batch: NewEvent[] = updated ? [scored, event("estimate_updated", { competencyId: updated.competencyId, mean: updated.mean, confidence: updated.confidence, samples: updated.samples }, scored.runId)] : [scored];
    await appendEvents(prisma, sessionId, batch);
    events = next;
  }
}
