import "server-only";

import { prisma } from "@/lib/db";

import { scheduleMockInterviewCompletion, scheduleMockInterviewQuestionEvaluation } from "../question-evaluation-background";
import { claimSession } from "../session-state";
import { loadSkillPacks } from "../skills/loader";
import { packsForInterview } from "../skills/selector";
import type { CandidateIntent } from "./actions";
import { parseStoredBrief, type InterviewArea, type InterviewBrief } from "./brief";
import { evidenceSummary } from "./evidence";
import { parseStoredMemory, type MemoryPatch } from "./memory";
import { applyTurn, type CandidateInput, type TurnResult } from "./reducer";
import {
  createInterviewerState,
  type InterviewerState,
  type MessageKind,
  type MessageMetrics,
  type MessageRole,
  type MessageState,
  type ThreadState,
  type ThreadStatus,
} from "./state";
import { streamInterviewerTurn } from "./turn-agent";

/**
 * 面试官回合的本地版编排：从数据库装配状态 → 跑回合 → 应用 reducer → 一个事务落库。
 * 线程关闭时写一条 InterviewQuestion 作为兼容层，逐题评分、复盘、画像照旧；
 * 每回合另写一条决策记录（提案、裁决、信息量变化），trace 页面与评测读它。
 */

export type CandidateMessageInput = {
  clientId: string;
  content: string;
  intent: CandidateIntent;
  /** 语音作答的指标（P2 接入），原样并入消息元数据。 */
  voiceMetricsJson?: string | null;
};

type LoadedSession = {
  session: NonNullable<Awaited<ReturnType<typeof loadSessionRow>>>;
  brief: InterviewBrief;
  state: InterviewerState;
  context: { jobTitle: string; jobDescription: string; resumeText: string };
};

function loadSessionRow(sessionId: string) {
  return prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: {
      interview: { select: { id: true, jobTitle: true } },
      messages: { orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }] },
      threads: { orderBy: { createdAt: "asc" } },
    },
  });
}

function toThreadState(row: LoadedSession["session"]["threads"][number]): ThreadState {
  return {
    id: row.id,
    areaId: row.areaId,
    entryQuestion: row.entryQuestion,
    status: row.status as ThreadStatus,
    depth: row.depth,
    rescues: row.rescues,
    clarifies: row.clarifies,
    interrupts: row.interrupts,
    openedAtTurn: row.openedAtTurn,
    closedAtTurn: row.closedAtTurn,
    note: row.note,
  };
}

function parseMetrics(json: string | null): MessageMetrics | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<MessageMetrics>;
    return {
      composeMs: typeof value.composeMs === "number" ? value.composeMs : null,
      chars: typeof value.chars === "number" ? value.chars : 0,
    };
  } catch {
    return null;
  }
}

function toMessageState(row: LoadedSession["session"]["messages"][number]): MessageState {
  return {
    id: row.id,
    turnIndex: row.turnIndex,
    role: row.role as MessageRole,
    kind: row.kind as MessageKind,
    content: row.content,
    threadId: row.threadId,
    toolName: row.toolName,
    metrics: parseMetrics(row.metricsJson),
  };
}

export async function loadInterviewerSession(sessionId: string): Promise<LoadedSession> {
  const session = await loadSessionRow(sessionId);
  if (!session) throw new Error("模拟面试不存在。");
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) throw new Error("这场面试还没有准备好。");
  const state = createInterviewerState({
    brief,
    memory: parseStoredMemory(session.memoryJson, brief),
    threads: session.threads.map(toThreadState),
    messages: session.messages.map(toMessageState),
    ended: session.status !== "in_progress",
  });
  return {
    session,
    brief,
    state,
    context: {
      jobTitle: session.interview.jobTitle,
      jobDescription: session.jdTextSnapshot,
      resumeText: session.resumeTextSnapshot,
    },
  };
}

function categoryForArea(area: InterviewArea | null): string {
  if (area?.kind === "project") return "resume_project";
  if (area?.kind === "behavioral") return "general";
  return "technical";
}

/** 候选人这条消息的作答元数据：从面试官上一句落库到现在的时间、字数、语音指标。 */
function candidateMetrics(loaded: LoadedSession, candidate: CandidateMessageInput): MessageMetrics & { voice?: unknown } {
  const lastInterviewer = [...loaded.session.messages].reverse().find((message) => message.role === "interviewer");
  const composeMs = lastInterviewer ? Math.max(0, Date.now() - lastInterviewer.createdAt.getTime()) : null;
  let voice: unknown;
  if (candidate.voiceMetricsJson) {
    try {
      voice = JSON.parse(candidate.voiceMetricsJson) as unknown;
    } catch {
      voice = undefined;
    }
  }
  return { composeMs, chars: candidate.content.length, ...(voice !== undefined ? { voice } : {}) };
}

export type TurnTrace = {
  runId: string;
  skillsLoaded: number;
  memoryPatch: MemoryPatch | null;
};

/** 把一个回合的结果原子写库；线程关闭时同时写兼容层的题目与评分记录，并落一条决策记录。 */
export async function persistTurn(
  loaded: LoadedSession,
  before: InterviewerState,
  result: TurnResult,
  candidate: CandidateMessageInput | null,
  trace: TurnTrace,
): Promise<void> {
  const sessionId = loaded.session.id;
  const areas = new Map(loaded.brief.areas.map((area) => [area.id, area]));
  const closedEffects = result.effects.filter((effect) => effect.type === "thread_closed");
  const ended = result.effects.some((effect) => effect.type === "interview_ended");
  const evaluationIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    // 同一回合序号只能落一次：并发的第二个回合在这里失败，而不是把状态写乱。
    const clash = await tx.mockInterviewMessage.count({
      where: { sessionId, turnIndex: before.turnIndex },
    });
    if (clash > 0) throw new Error("另一回合正在进行，请稍后重试。");

    for (const thread of result.state.threads) {
      const previous = before.threads.find((item) => item.id === thread.id);
      const counters = {
        status: thread.status,
        depth: thread.depth,
        rescues: thread.rescues,
        clarifies: thread.clarifies,
        interrupts: thread.interrupts,
        closedAtTurn: thread.closedAtTurn,
        note: thread.note,
      };
      if (!previous) {
        await tx.interviewThread.create({
          data: {
            id: thread.id,
            sessionId,
            areaId: thread.areaId,
            entryQuestion: thread.entryQuestion,
            openedAtTurn: thread.openedAtTurn,
            ...counters,
          },
        });
      } else if (JSON.stringify(previous) !== JSON.stringify(thread)) {
        await tx.interviewThread.update({ where: { id: thread.id }, data: counters });
      }
    }

    for (const message of result.newMessages) {
      await tx.mockInterviewMessage.create({
        data: {
          id: message.id,
          sessionId,
          clientId: message.role === "candidate" ? candidate?.clientId ?? null : null,
          turnIndex: message.turnIndex,
          role: message.role,
          kind: message.kind,
          content: message.content,
          threadId: message.threadId,
          toolName: message.toolName,
          metricsJson: message.metrics ? JSON.stringify(message.metrics) : null,
        },
      });
    }

    const closedCount = result.state.threads.filter((thread) => thread.status !== "active").length;
    for (const effect of closedEffects) {
      const area = areas.get(effect.thread.areaId) ?? null;
      const sortOrder = result.state.threads.findIndex((thread) => thread.id === effect.thread.id);
      const question = await tx.interviewQuestion.create({
        data: {
          interviewId: loaded.session.interviewId,
          question: effect.segment.question,
          answer: effect.segment.skipped ? null : effect.segment.answer,
          skippedAt: effect.segment.skipped ? new Date() : null,
          category: categoryForArea(area),
          sortOrder: sortOrder < 0 ? closedCount : sortOrder,
          evaluation: {
            create: {
              sourceKind: area?.kind ?? "technical",
              rubricJson: JSON.stringify(area?.rubric ?? []),
              expectedSignalsJson: JSON.stringify(area?.expectedSignals ?? []),
              generationMetadataJson: JSON.stringify({
                areaId: effect.thread.areaId,
                areaName: area?.name ?? null,
                areaKind: area?.kind ?? null,
                areaStyle: area?.style ?? null,
                // 溯源：这段考的是 JD 明确要求的，还是技能包补的岗位常见要求。
                competencyOrigin: !area ? null : area.competencyIds.length > 0 ? "jd" : area.baseline ? "baseline" : null,
                skillPack: area?.baseline?.skill ?? null,
                note: effect.thread.note,
                depth: effect.thread.depth,
                probeCount: effect.segment.probeCount,
                rescues: effect.thread.rescues,
                answerSeconds: effect.segment.answerSeconds,
              }),
            },
          },
        },
        select: { id: true },
      });
      await tx.interviewThread.update({
        where: { id: effect.thread.id },
        data: { questionId: question.id },
      });
      if (!effect.segment.skipped) evaluationIds.push(question.id);
    }

    await tx.interviewTurnDecision.create({
      data: {
        sessionId,
        turnIndex: before.turnIndex,
        runId: trace.runId,
        proposedAction: result.decision.proposed,
        appliedAction: result.decision.applied,
        followUp: result.decision.followUp,
        replacedReason: result.decision.replacedReason,
        anchorHit: result.decision.anchorHit,
        memoryPatchJson: trace.memoryPatch ? JSON.stringify(trace.memoryPatch) : null,
        evidenceBefore: evidenceSummary(before).total,
        evidenceAfter: evidenceSummary(result.state).total,
        skillsLoaded: trace.skillsLoaded,
        effectsJson: JSON.stringify(result.effects.map((effect) => effect.type)),
      },
    });

    await tx.mockInterviewSession.update({
      where: { id: sessionId },
      data: {
        memoryJson: JSON.stringify(result.state.memory),
        questionCount: closedCount,
        currentQuestionIndex: closedCount,
        startedAt: loaded.session.startedAt ?? new Date(),
      },
    });
    if (ended) {
      await claimSession(tx, {
        where: { id: sessionId, status: "in_progress" },
        data: { status: "ready_to_evaluate" },
      });
    }
  });

  for (const questionId of evaluationIds) {
    scheduleMockInterviewQuestionEvaluation(questionId);
  }
  if (ended) scheduleMockInterviewCompletion(sessionId);
}

export type TurnReplay = { replay: true; messages: MessageState[] };
export type TurnStart = {
  replay: false;
  stream: Awaited<ReturnType<typeof streamInterviewerTurn>>["stream"];
  /** 流结束后调用：应用 reducer 并落库，返回本回合新增的消息。 */
  finalize: () => Promise<TurnResult>;
};

/**
 * 开始一个回合。候选人消息带 clientId：重复提交直接回放当时的面试官回应，
 * 不再调模型。开场回合（candidate 为 null）在已有消息时同样回放。
 */
export async function startInterviewerTurn(input: {
  sessionId: string;
  candidate: CandidateMessageInput | null;
}): Promise<TurnReplay | TurnStart> {
  const loaded = await loadInterviewerSession(input.sessionId);
  if (loaded.session.status !== "in_progress") {
    throw new Error("这场面试已经结束，不能继续对话。");
  }

  if (input.candidate) {
    const existing = loaded.session.messages.find(
      (message) => message.clientId === input.candidate!.clientId,
    );
    if (existing) {
      return {
        replay: true,
        messages: loaded.session.messages
          .filter((message) => message.turnIndex === existing.turnIndex && message.role === "interviewer")
          .map(toMessageState),
      };
    }
  } else if (loaded.state.messages.length > 0) {
    return { replay: true, messages: loaded.state.messages.filter((m) => m.turnIndex === 0 && m.role === "interviewer") };
  }

  const candidateInput: CandidateInput | null = input.candidate
    ? {
        id: crypto.randomUUID(),
        content: input.candidate.content,
        intent: input.candidate.intent,
        metrics: candidateMetrics(loaded, input.candidate),
      }
    : null;
  const runId = `turn:${input.sessionId}:${loaded.state.turnIndex}`;
  const { stream, settled } = await streamInterviewerTurn({
    runId,
    state: loaded.state,
    candidate: input.candidate ? { content: input.candidate.content, intent: input.candidate.intent } : null,
    context: loaded.context,
    skillPacks: packsForInterview(loaded.brief.skillPacks, await loadSkillPacks()),
  });

  return {
    replay: false,
    stream,
    finalize: async () => {
      const { decision, skillsLoaded } = await settled;
      const result = applyTurn(loaded.state, candidateInput, decision);
      await persistTurn(loaded, loaded.state, result, input.candidate, { runId, skillsLoaded, memoryPatch: decision.memoryPatch });
      return result;
    },
  };
}
