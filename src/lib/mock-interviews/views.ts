import type { InterviewBrief } from "./interviewer/brief";
import type { InterviewMemory } from "./interviewer/memory";
import { interviewerNote } from "./interviewer/reducer";
import type { MessageState, ThreadState } from "./interviewer/state";
import type { TurnDecisionRow } from "./interviewer/turn";
import type { MockInterviewConversation, MockInterviewTraceTurn } from "./types";

/**
 * 对话式面试的视图拼装：纯数据进、页面组件吃的形状出。
 * 本地版从数据库行映射后调用（queries.ts），体验版从会话文档直接调用。
 */

export function conversationView(input: {
  brief: InterviewBrief;
  status: string;
  startedAt: string | null;
  threads: (Pick<ThreadState, "id" | "areaId" | "status" | "depth" | "rescues" | "note"> & { questionId: string | null })[];
  messages: Pick<MessageState, "id" | "turnIndex" | "role" | "kind" | "content" | "threadId">[];
  memory: InterviewMemory;
}): MockInterviewConversation {
  const ended = input.status !== "in_progress";
  const completed = input.status === "completed";
  return {
    phase: ended ? "ended" : input.messages.length === 0 ? "opening" : "running",
    pace: input.brief.pace,
    plannedTurns: input.brief.plannedTurns,
    startedAt: input.startedAt,
    areas: input.brief.areas.map((area) => {
      const threads = input.threads.filter((thread) => thread.areaId === area.id);
      return {
        id: area.id,
        name: area.name,
        kind: area.kind,
        weight: area.weight,
        depth: area.depth,
        depthReached: Math.max(0, ...threads.map((thread) => thread.depth)),
        status: threads.some((thread) => thread.status === "active") ? "active" : threads.length > 0 ? "covered" : "pending",
      };
    }),
    droppedAreas: input.brief.droppedAreas,
    threads: input.threads.map((thread) => ({
      id: thread.id,
      areaId: thread.areaId,
      status: thread.status,
      depth: thread.depth,
      rescues: thread.rescues,
      note: interviewerNote(thread.note),
      questionId: thread.questionId,
    })),
    messages: input.messages.map((message) => ({
      id: message.id,
      turnIndex: message.turnIndex,
      role: message.role,
      kind: message.kind,
      content: message.content,
      threadId: message.threadId,
    })),
    // 工作记忆面试中不给候选人看，报告页展示"面试官当时的判断"。
    memory: completed ? input.memory : null,
    hypotheses: completed ? input.brief.hypotheses : [],
  };
}

export type TraceRun = { status: string; durationMs: number; totalTokens: number | null; errorKind: string | null };

/** trace 页：按回合把候选人的话、面试官的话、决策记录与模型开销拼在一起。 */
export function traceTurns(input: {
  messages: (Pick<MessageState, "turnIndex" | "role" | "kind" | "content" | "toolName"> & { composeMs?: number | null })[];
  decisions: Omit<TurnDecisionRow, "runId">[];
  /** 每回合的模型开销（本地版从 AgentRun 关联；体验版没有记账，留空）。 */
  runs?: Map<number, TraceRun>;
}): MockInterviewTraceTurn[] {
  const decisionByTurn = new Map(input.decisions.map((decision) => [decision.turnIndex, decision]));
  const turnIndexes = [...new Set(input.messages.map((message) => message.turnIndex))].sort((a, b) => a - b);
  return turnIndexes.map((turnIndex) => {
    const own = input.messages.filter((message) => message.turnIndex === turnIndex);
    const candidate = own.find((message) => message.role === "candidate");
    const decision = decisionByTurn.get(turnIndex);
    return {
      turnIndex,
      candidate: candidate ? { kind: candidate.kind, content: candidate.content, composeMs: candidate.composeMs ?? null } : null,
      interviewer: own
        .filter((message) => message.role === "interviewer")
        .map((message) => ({ kind: message.kind, content: message.content, toolName: message.toolName })),
      decision: decision
        ? {
            proposedAction: decision.proposedAction,
            appliedAction: decision.appliedAction,
            followUp: decision.followUp,
            replacedReason: decision.replacedReason,
            anchorHit: decision.anchorHit,
            memoryPatch: decision.memoryPatch,
            evidenceBefore: decision.evidenceBefore,
            evidenceAfter: decision.evidenceAfter,
            skillsLoaded: decision.skillsLoaded,
            effects: decision.effects,
          }
        : null,
      run: input.runs?.get(turnIndex) ?? null,
    };
  });
}
