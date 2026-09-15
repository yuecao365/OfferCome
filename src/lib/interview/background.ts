import "server-only";

import { after } from "next/server";

import type { AiTaskConfig } from "@/lib/ai/config";
import { prisma } from "@/lib/db";
import { parseStoredBrief } from "@/lib/mock-interviews/brief/brief";
import { competenciesOf } from "@/lib/mock-interviews/context";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { critique } from "./critic";
import { estimate, observationsFromEvents } from "./estimator";
import { appendEvents, event, parseEventRow, transcriptOf, type InterviewEvent, type NewEvent } from "./events";
import { sessionFlags } from "./flags";
import { closedSegments, judgeSegment } from "./judge";
import { memoryOf, priorsFrom } from "./memory";
import { runPolicy, type PolicyContext } from "./policy";
import { buildCard, clockFor, planTurn, type CandidateInput, type TurnState } from "./turn";
import type { PolicyVariant } from "./variants";

/**
 * 实验层的后台任务（会话开关 lab 打开时才跑；响应返回后顺序跑，只写事件与 trace，不进现场卡）：
 * 评论员看面试官刚说的那句（critic_noted）；在线评委给已结束的段打分（segment_scored），估计器随之更新（estimate_updated）。
 * 与下一回合的落库可能同时分配 seq（唯一约束冲突）：冲突就放弃这次，下次再来——评过与否以事件为准，不会重复。
 */

async function loadLive(sessionId: string) {
  const loaded = await prisma.mockInterviewSession.findUnique({ where: { id: sessionId }, include: { events: { orderBy: { seq: "asc" } } } });
  if (!loaded || loaded.status !== "in_progress") return null;
  const brief = parseStoredBrief(loaded.briefJson);
  if (!brief) return null;
  const events = loaded.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  return { brief, events, competencies: competenciesOf(loaded.contextSnapshotJson), priors: priorsFrom(memoryOf(loaded.contextSnapshotJson)), flags: sessionFlags(loaded.flagsJson), totalMinutes: loaded.durationMinutes, realTime: loaded.interactionMode === "voice" };
}

export function scheduleLab(sessionId: string): void {
  after(async () => {
    const live = await loadLive(sessionId);
    if (!live?.flags.lab) return;
    const steps: [string, () => Promise<void>][] = [
      ["评论员", () => critiqueLastTurn(sessionId)],
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

/** 按面试官自报的材料切出的段里已结束、还没评分的：逐段评分，每段评完立刻落事件（连同受影响能力的新估计）。 */
async function judgeClosedSegments(sessionId: string): Promise<void> {
  const live = await loadLive(sessionId);
  if (!live || live.competencies.length === 0) return;
  const transcript = transcriptOf(live.events);
  const config = await getAiTaskConfig("text");
  let events = live.events;
  for (const segment of closedSegments(events, transcript)) {
    const scored = await judgeSegment({ runId: `judge:${sessionId}:${segment.startSeq}`, config, brief: live.brief, competencies: live.competencies, transcript, segment });
    if (!scored) continue;
    const next = [...events, { ...scored, seq: -1, at: new Date() } as InterviewEvent];
    const updated = estimate(live.competencies, observationsFromEvents(next), live.priors).find((item) => item.competencyId === scored.payload.competencyId);
    const batch: NewEvent[] = updated ? [scored, event("estimate_updated", { competencyId: updated.competencyId, mean: updated.mean, confidence: updated.confidence, samples: updated.samples }, scored.runId)] : [scored];
    await appendEvents(prisma, sessionId, batch);
    events = next;
  }
}

/** 评论员看面试官刚说的那句；已经评过（同一编号有 critic_noted）就不再评。 */
async function critiqueLastTurn(sessionId: string): Promise<void> {
  const live = await loadLive(sessionId);
  if (!live) return;
  const transcript = transcriptOf(live.events);
  const last = [...transcript].reverse().find((line) => line.role === "interviewer");
  if (!last || live.events.some((item) => item.type === "critic_noted" && item.payload.seq === last.seq)) return;
  const noted = await critique({ runId: `critic:${sessionId}:${last.seq}`, config: await getAiTaskConfig("text"), transcript, clock: clockFor({ totalMinutes: live.totalMinutes, realTime: live.realTime }, transcript) });
  if (noted) await appendEvents(prisma, sessionId, [noted]);
}

/**
 * 影子运行：影子变体在真身刚用过的那张现场卡上再说一句（不流给房间、不改状态），评论员按同一套准则判一下，写 shadow_said。
 * 每回合多一次 actor 调用 + 一次评论员调用，所以只在会话开关里指定了影子时跑。
 */
export function scheduleShadow(input: { sessionId: string; turnIndex: number; config: AiTaskConfig; state: TurnState; candidate: CandidateInput | null; context: PolicyContext; variant: PolicyVariant }): void {
  after(async () => {
    try {
      const plan = planTurn(input.state, input.candidate);
      if (plan.kind !== "model") return;
      const policy = runPolicy({ runId: `shadow:${input.sessionId}:${input.turnIndex}`, config: input.config, brief: input.state.brief, context: input.context, transcript: input.state.transcript, card: buildCard(input.state, plan.clock, plan.decision), candidateContent: input.candidate?.content ?? null, variant: input.variant });
      for await (const _delta of policy.say) void _delta;
      const { output } = await policy.settled;
      if (!output) return;
      const withCandidate = input.candidate ? [...input.state.transcript, { seq: input.state.transcript.length, role: "candidate" as const, content: input.candidate.content, kind: null, control: input.candidate.control }] : input.state.transcript;
      const transcript = [...withCandidate, { seq: withCandidate.length, role: "interviewer" as const, content: output.say, kind: "say", control: null }];
      const noted = await critique({ runId: `shadow-critic:${input.sessionId}:${input.turnIndex}`, config: input.config, transcript, clock: plan.clock }).catch(() => null);
      await appendEvents(prisma, input.sessionId, [event("shadow_said", { turnIndex: input.turnIndex, variant: input.variant.id, say: output.say, notebook: output.notebook, rule: noted?.payload.rule ?? null }, `shadow:${input.sessionId}:${input.turnIndex}`)]);
    } catch (error) {
      console.warn("[interview] 影子这回合没跑成。", error instanceof Error ? error.message : error);
    }
  });
}
