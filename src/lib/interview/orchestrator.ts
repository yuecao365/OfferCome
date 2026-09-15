import "server-only";

import { prisma } from "@/lib/db";
import { parseStoredBrief } from "@/lib/mock-interviews/brief/brief";
import { competenciesOf } from "@/lib/mock-interviews/context";
import { scheduleMockInterviewCompletion } from "@/lib/mock-interviews/question-evaluation-background";
import { claimSession } from "@/lib/mock-interviews/session-state";
import { loadSkillPacks } from "@/lib/mock-interviews/skills/loader";
import { packsForInterview } from "@/lib/mock-interviews/skills/selector";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { scheduleLabeling } from "./background";
import { estimate, observationsFromEvents } from "./estimator";
import { appendEvents, parseEventRow, transcriptOf, type InterviewEvent } from "./events";
import { coveredMaterials } from "./labeler";
import { runTurn, type CandidateInput, type TurnResult, type TurnState } from "./turn";
import type { ConversationMessage, TurnPayload } from "./views";

/**
 * 本地版编排器（interview-system-design.md §6.6）：装状态 → 跑回合 → 一个事务落库。
 * 会话状态机：generating → in_progress → ready_to_evaluate → evaluating → completed。
 * 幂等：候选人消息带 clientId，重复提交回放当时的面试官消息，不调模型；同一回合序号只落一次。
 */

type Loaded = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

function loadSession(sessionId: string) {
  return prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: {
      interview: { select: { jobTitle: true } },
      events: { orderBy: { seq: "asc" } },
      messages: { orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }] },
    },
  });
}

function turnState(loaded: Loaded): TurnState {
  const brief = parseStoredBrief(loaded.briefJson);
  if (!brief) throw new Error("这场面试还没有准备好。");
  const events = loaded.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  const transcript = transcriptOf(events);
  return {
    brief,
    notebook: loaded.notebook,
    transcript,
    totalMinutes: loaded.durationMinutes,
    phase: loaded.status !== "in_progress" ? "ended" : transcript.length === 0 ? "opening" : "running",
    covered: coveredMaterials(events),
    estimates: estimate(competenciesOf(loaded.contextSnapshotJson), observationsFromEvents(events)),
  };
}

export type CandidateMessageInput = CandidateInput & { clientId: string; voiceMetricsJson?: string | null };

export type TurnReplay = { replay: true; messages: ConversationMessage[] };
export type TurnStart = { replay: false; say: AsyncIterable<string>; finalize: () => Promise<TurnPayload> };

/** 开始一个回合；重复的 clientId 或已开场的开场回合直接回放。 */
export async function startTurn(input: { sessionId: string; candidate: CandidateMessageInput | null }): Promise<TurnReplay | TurnStart> {
  const loaded = await loadSession(input.sessionId);
  if (!loaded) throw new Error("模拟面试不存在。");
  if (loaded.status !== "in_progress") throw new Error("这场面试已经结束，不能继续对话。");

  const replayOf = (turnIndex: number): TurnReplay => ({
    replay: true,
    messages: loaded.messages.filter((message) => message.turnIndex === turnIndex && message.role === "interviewer").map(toConversationMessage),
  });
  if (input.candidate) {
    const seen = loaded.messages.find((message) => message.clientId === input.candidate!.clientId);
    if (seen) return replayOf(seen.turnIndex);
  } else if (loaded.messages.length > 0) {
    return replayOf(0);
  }

  const state = turnState(loaded);
  const turnIndex = loaded.messages.filter((message) => message.role === "interviewer").length;
  const [config, packs] = await Promise.all([getAiTaskConfig("text"), loadSkillPacks()]);
  const run = runTurn({
    runId: `turn:${input.sessionId}:${turnIndex}`,
    config,
    state,
    candidate: input.candidate,
    context: {
      jobTitle: loaded.interview.jobTitle,
      jobDescription: loaded.jdTextSnapshot,
      resumeText: loaded.resumeTextSnapshot,
      totalMinutes: loaded.durationMinutes,
      skillPacks: packsForInterview(state.brief.skillPacks, packs),
    },
  });
  return {
    replay: false,
    say: run.say,
    finalize: async () => {
      const result = await run.finalize();
      const newMessages = await persistTurn(loaded, turnIndex, input.candidate, result);
      if (result.phase !== "ended") scheduleLabeling(input.sessionId);
      return { newMessages, phase: result.phase, clock: result.clock, endedBy: result.endedBy, coveredCount: state.covered.length };
    },
  };
}

function toConversationMessage(row: { id: string; turnIndex: number; role: string; kind: string; content: string }): ConversationMessage {
  return { id: row.id, turnIndex: row.turnIndex, role: row.role === "candidate" ? "candidate" : "interviewer", kind: row.kind, content: row.content };
}

/** 一个事务：事件日志 + 消息投影 + 会话字段；结束时进入待评分并安排交卷。 */
async function persistTurn(loaded: Loaded, turnIndex: number, candidate: CandidateMessageInput | null, result: TurnResult): Promise<ConversationMessage[]> {
  const sessionId = loaded.id;
  const created: ConversationMessage[] = [];
  // SQLite 单写者：并发的另一场正在落库时这里要等锁；默认 5 秒的事务超时在评测并发跑时不够。
  await prisma.$transaction(async (tx) => {
    const clash = await tx.mockInterviewMessage.count({ where: { sessionId, turnIndex } });
    if (clash > 0) throw new Error("另一回合正在进行，请稍后重试。");
    for (const line of result.said) {
      const row = await tx.mockInterviewMessage.create({
        data: {
          sessionId,
          clientId: line.role === "candidate" ? (candidate?.clientId ?? null) : null,
          turnIndex,
          role: line.role,
          kind: line.kind,
          content: line.content,
          metricsJson: line.role === "candidate" && candidate ? JSON.stringify({ composeMs: candidate.composeMs, chars: candidate.content.length, voice: candidate.voiceMetricsJson ?? null }) : null,
        },
        select: { id: true, turnIndex: true, role: true, kind: true, content: true },
      });
      created.push(toConversationMessage(row));
    }
    await appendEvents(tx, sessionId, result.events);
    await tx.mockInterviewSession.update({
      where: { id: sessionId },
      data: { notebook: result.notebook, clockJson: JSON.stringify(result.clock), startedAt: loaded.startedAt ?? new Date() },
    });
    if (result.phase === "ended") {
      await claimSession(tx, { where: { id: sessionId, status: "in_progress" }, data: { status: "ready_to_evaluate" } });
    }
  }, { maxWait: 20_000, timeout: 30_000 });
  if (result.phase === "ended") scheduleMockInterviewCompletion(sessionId);
  return created;
}
