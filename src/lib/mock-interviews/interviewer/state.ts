import type { InterviewBrief } from "./brief";
import type { InterviewMemory } from "./memory";

/**
 * 面试官回合的状态：简报 + 记忆 + 线程 + 消息。纯数据，本地版从数据库装配，
 * 体验版从浏览器存储装配，回合逻辑对两端一视同仁。
 */

export type ThreadStatus = "active" | "closed" | "skipped";

export type ThreadState = {
  id: string;
  areaId: string;
  entryQuestion: string;
  status: ThreadStatus;
  depth: number;
  rescues: number;
  openedAtTurn: number;
  closedAtTurn: number | null;
  note: string | null;
};

export type MessageRole = "interviewer" | "candidate";
export type MessageKind =
  | "opening"
  | "intro_request"
  | "question"
  | "probe"
  | "rescue"
  | "repeat"
  | "closing"
  | "answer"
  | "aside";

export type MessageState = {
  id: string;
  turnIndex: number;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  threadId: string | null;
  toolName: string | null;
};

export type InterviewPhase = "opening" | "running" | "ended";

export type InterviewerState = {
  brief: InterviewBrief;
  memory: InterviewMemory;
  threads: ThreadState[];
  messages: MessageState[];
  /** 下一回合的序号；一回合 = 一条候选人消息 + 面试官的回应。 */
  turnIndex: number;
  phase: InterviewPhase;
  /** 连续没有推进动作的回合数。 */
  idleTurns: number;
};

export function activeThread(state: InterviewerState): ThreadState | null {
  return state.threads.find((thread) => thread.status === "active") ?? null;
}

export function areaById(state: InterviewerState, areaId: string) {
  return state.brief.areas.find((area) => area.id === areaId) ?? null;
}

export function threadsOfArea(state: InterviewerState, areaId: string): ThreadState[] {
  return state.threads.filter((thread) => thread.areaId === areaId);
}

/** 一个线程占用的回合数：从打开到关闭（未关闭则到当前）。 */
export function threadTurns(thread: ThreadState, currentTurn: number): number {
  const end = thread.closedAtTurn ?? currentTurn;
  return Math.max(0, end - thread.openedAtTurn);
}

export function areaTurnsUsed(state: InterviewerState, areaId: string): number {
  return threadsOfArea(state, areaId).reduce(
    (sum, thread) => sum + threadTurns(thread, state.turnIndex),
    0,
  );
}

export function lastInterviewerQuestion(state: InterviewerState): MessageState | null {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (
      message.role === "interviewer" &&
      (message.kind === "question" || message.kind === "probe" || message.kind === "intro_request")
    ) {
      return message;
    }
  }
  return null;
}

export function derivePhase(threads: ThreadState[], messages: MessageState[], ended: boolean): InterviewPhase {
  if (ended) return "ended";
  return messages.length === 0 ? "opening" : "running";
}

export function createInterviewerState(input: {
  brief: InterviewBrief;
  memory: InterviewMemory;
  threads: ThreadState[];
  messages: MessageState[];
  ended: boolean;
  idleTurns?: number;
}): InterviewerState {
  const turnIndex = input.messages.reduce((max, message) => Math.max(max, message.turnIndex + 1), 0);
  return {
    brief: input.brief,
    memory: input.memory,
    threads: input.threads,
    messages: input.messages,
    turnIndex,
    phase: derivePhase(input.threads, input.messages, input.ended),
    idleTurns: input.idleTurns ?? 0,
  };
}
