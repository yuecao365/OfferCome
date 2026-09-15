import "server-only";

import { after } from "next/server";

import { prisma } from "@/lib/db";
import { parseStoredBrief } from "@/lib/mock-interviews/brief/brief";
import { competenciesOf } from "@/lib/mock-interviews/context";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { estimateClock } from "./clock";
import { critique } from "./critic";
import { estimate, observationsFromEvents } from "./estimator";
import { appendEvents, event, parseEventRow, transcriptOf, type InterviewEvent, type NewEvent } from "./events";
import { sessionFlags } from "./flags";
import { closedSegments, judgeSegment } from "./judge";
import { labelingDue, labelRecent } from "./labeler";

/**
 * 面试中的后台任务（响应返回后顺序跑）：评论员每回合看面试官刚说的那句（critic_noted，开关可关）；标注器每两次交换标一次
 * （label_added）；标出一段结束时在线评委给那段打分（segment_scored），估计器随之更新（estimate_updated）。
 * 与下一回合的落库可能同时分配 seq（唯一约束冲突）：冲突就放弃这次，下次再来——标过 / 评过与否以事件为准，不会重复。
 */

async function loadLive(sessionId: string) {
  const loaded = await prisma.mockInterviewSession.findUnique({ where: { id: sessionId }, include: { events: { orderBy: { seq: "asc" } } } });
  if (!loaded || loaded.status !== "in_progress") return null;
  const brief = parseStoredBrief(loaded.briefJson);
  if (!brief) return null;
  const events = loaded.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  return { brief, events, competencies: competenciesOf(loaded.contextSnapshotJson), flags: sessionFlags(loaded.flagsJson), totalMinutes: loaded.durationMinutes };
}

export function scheduleLabeling(sessionId: string): void {
  after(async () => {
    // 评论员最先：它的提醒只对下一回合有用，候选人答得快时排在标注、评委后面就赶不上（冒烟里 12 条提醒只注入了 5 条）。
    // 三步顺序跑不并行：并行写事件会争同一个 seq。
    const steps: [string, () => Promise<void>][] = [
      ["评论员", () => critiqueLastTurn(sessionId)],
      ["标注器", () => labelPending(sessionId)],
      ["评委", () => judgeClosedSegments(sessionId)],
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        console.warn(`[interview] ${name}这次没跑成，下次再来。`, error instanceof Error ? error.message : error);
      }
    }
  });
}

async function labelPending(sessionId: string): Promise<void> {
  const live = await loadLive(sessionId);
  if (!live) return;
  const transcript = transcriptOf(live.events);
  if (!labelingDue(transcript, live.events)) return;
  const labels = await labelRecent({ runId: `label:${sessionId}:${transcript.length}`, config: await getAiTaskConfig("text"), brief: live.brief, transcript, events: live.events });
  await appendEvents(prisma, sessionId, labels);
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

/** 评论员看面试官刚说的那句；已经评过（同一编号有 critic_noted）就不再评。 */
async function critiqueLastTurn(sessionId: string): Promise<void> {
  const live = await loadLive(sessionId);
  if (!live || !live.flags.critic) return;
  const transcript = transcriptOf(live.events);
  const last = [...transcript].reverse().find((line) => line.role === "interviewer");
  if (!last || live.events.some((item) => item.type === "critic_noted" && item.payload.seq === last.seq)) return;
  const noted = await critique({ runId: `critic:${sessionId}:${last.seq}`, config: await getAiTaskConfig("text"), transcript, clock: estimateClock(transcript, live.totalMinutes) });
  if (noted) await appendEvents(prisma, sessionId, [noted]);
}
