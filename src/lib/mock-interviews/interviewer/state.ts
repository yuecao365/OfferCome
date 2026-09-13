import type { ThreadVerdict } from "./actions";
import type { AreaKind, InterviewArea, InterviewBrief } from "./brief";
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
  /** 追问层数。 */
  depth: number;
  /** 这条线程已经给过一次提示（每线程只给一次）。 */
  hinted: boolean;
  /** 连续几条回答被面试官判为只有关键词：关键词回答只追一次。 */
  thinStreak: number;
  /** 关线程时面试官对这段的判断（answered / thin / failed）；进行中、跳过、系统推进关掉的为 null。 */
  verdict: ThreadVerdict | null;
  openedAtTurn: number;
  closedAtTurn: number | null;
  note: string | null;
};

export type MessageRole = "interviewer" | "candidate";
/**
 * 面试官侧：intro_request 开场、question 切入问题、probe 追问、hint 提示、closing 收尾，
 * aside 只在"再说一遍"时复述上一问。候选人侧：answer 是实质回答（含线程外的自我介绍），
 * aside 是由代码处理的插话（跳过 / 再说一遍 / 结束 / 卡住 / 否定简历）。
 */
export type MessageKind = "intro_request" | "question" | "probe" | "hint" | "closing" | "answer" | "aside";

/** 面试官"问了一次"的消息类型：切入问题、追问、开场请自我介绍。 */
export const QUESTION_KINDS = new Set<MessageKind>(["intro_request", "question", "probe"]);

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
};

export function activeThread(state: InterviewerState): ThreadState | null {
  return state.threads.find((thread) => thread.status === "active") ?? null;
}

export function areaById(state: InterviewerState, areaId: string): InterviewArea | null {
  return state.brief.areas.find((area) => area.id === areaId) ?? null;
}

/** 线程属于哪个阶段；简报里找不到领域时按基础题处理（最保守：一题一问）。 */
export function threadKind(state: InterviewerState, thread: ThreadState): AreaKind {
  return areaById(state, thread.areaId)?.kind ?? "quick";
}

/** 这道题所属项目上还没验证的简历假设（项目的任何角度里都能验）；不是项目题时为空。 */
export function openHypotheses(state: InterviewerState, areaId: string) {
  const projectId = areaById(state, areaId)?.projectId;
  if (!projectId) return [];
  const status = new Map(state.memory.hypotheses.map((item) => [item.id, item.status]));
  return state.brief.hypotheses.filter((item) => item.projectId === projectId && (status.get(item.id) ?? "open") === "open");
}

export function threadOfArea(state: InterviewerState, areaId: string): ThreadState | null {
  return state.threads.find((thread) => thread.areaId === areaId) ?? null;
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
    if (message.role === "interviewer" && QUESTION_KINDS.has(message.kind)) return message;
  }
  return null;
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
  };
}
