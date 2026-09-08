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
  /** 追问层数（含打断）。 */
  depth: number;
  rescues: number;
  clarifies: number;
  interrupts: number;
  openedAtTurn: number;
  closedAtTurn: number | null;
  note: string | null;
};

export type MessageRole = "interviewer" | "candidate";
export type MessageKind =
  | "intro_request"
  | "question"
  | "probe"
  | "rescue"
  | "clarify"
  | "interrupt"
  | "closing"
  | "answer"
  | "aside";

/** 候选人这条消息的作答元数据：从面试官上一句落库到候选人发送的时间与字数。 */
export type MessageMetrics = { composeMs: number | null; chars: number };

export type MessageState = {
  id: string;
  turnIndex: number;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  threadId: string | null;
  toolName: string | null;
  metrics?: MessageMetrics | null;
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

/** 已结束的线程，按关闭顺序。 */
export function closedThreads(state: InterviewerState): ThreadState[] {
  return state.threads
    .filter((thread) => thread.status !== "active")
    .sort((left, right) => (left.closedAtTurn ?? 0) - (right.closedAtTurn ?? 0));
}

export function lastInterviewerQuestion(state: InterviewerState): MessageState | null {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (
      message.role === "interviewer" &&
      (message.kind === "question" || message.kind === "probe" || message.kind === "interrupt" || message.kind === "intro_request")
    ) {
      return message;
    }
  }
  return null;
}

/** 候选人最近一条实质回答（不含澄清提问与插话）。 */
export function lastCandidateAnswer(state: InterviewerState): MessageState | null {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message.role === "candidate" && message.kind === "answer") return message;
  }
  return null;
}

/**
 * 连续没有推进动作的回合数：从最后一回合往前数，面试官只"说话"（aside）的回合。
 * 每回合从数据库重建状态，所以必须从消息推导，否则"连续空转强制推进"永远不会触发。
 */
export function deriveIdleTurns(messages: MessageState[]): number {
  const turns = new Map<number, MessageState[]>();
  for (const message of messages) {
    if (message.role !== "interviewer") continue;
    turns.set(message.turnIndex, [...(turns.get(message.turnIndex) ?? []), message]);
  }
  let idle = 0;
  for (const turnIndex of [...turns.keys()].sort((a, b) => b - a)) {
    if (turns.get(turnIndex)!.every((message) => message.kind === "aside")) idle += 1;
    else break;
  }
  return idle;
}

export function derivePhase(messages: MessageState[], ended: boolean): InterviewPhase {
  if (ended) return "ended";
  return messages.length === 0 ? "opening" : "running";
}

export function createInterviewerState(input: {
  brief: InterviewBrief;
  memory: InterviewMemory;
  threads: ThreadState[];
  messages: MessageState[];
  ended: boolean;
}): InterviewerState {
  const turnIndex = input.messages.reduce((max, message) => Math.max(max, message.turnIndex + 1), 0);
  return {
    brief: input.brief,
    memory: input.memory,
    threads: input.threads,
    messages: input.messages,
    turnIndex,
    phase: derivePhase(input.messages, input.ended),
    idleTurns: deriveIdleTurns(input.messages),
  };
}
