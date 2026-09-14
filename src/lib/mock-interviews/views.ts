import type { InterviewBrief } from "./interviewer/brief";
import type { InterviewMemory } from "./interviewer/memory";
import { interviewStage } from "./interviewer/progress";
import { interviewerNote } from "./interviewer/reducer";
import { createInterviewerState, type InterviewPlan, type MessageState, type ThreadState } from "./interviewer/state";
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
  plan: InterviewPlan | null;
  threads: (ThreadState & { questionId: string | null })[];
  messages: MessageState[];
  memory: InterviewMemory;
}): MockInterviewConversation {
  const ended = input.status !== "in_progress";
  const completed = input.status === "completed";
  const state = createInterviewerState({ brief: input.brief, memory: input.memory, plan: input.plan, threads: input.threads, messages: input.messages, ended });
  return {
    phase: state.phase,
    pace: input.brief.pace,
    startedAt: input.startedAt,
    stage: interviewStage(state),
    threads: input.threads.map((thread) => ({
      id: thread.id,
      areaId: thread.areaId,
      kind: thread.kind,
      label: thread.label,
      status: thread.status,
      depth: thread.depth,
      verdict: thread.verdict,
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

export type TraceRun = { status: string; durationMs: number; totalTokens: number | null; cachedTokens: number | null; errorKind: string | null };

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
            planChanged: decision.planChanged,
            entered: decision.entered,
            left: decision.left,
            endedBy: decision.endedBy,
            failed: decision.failed,
            memoryPatch: decision.memoryPatch,
            turnsUsed: decision.turnsUsed,
            skillsLoaded: decision.skillsLoaded,
            effects: decision.effects,
          }
        : null,
      run: input.runs?.get(turnIndex) ?? null,
    };
  });
}
