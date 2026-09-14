import type { ThreadVerdict } from "./actions";
import type { AreaKind, InterviewArea, InterviewBrief } from "./brief";
import type { InterviewMemory } from "./memory";

/**
 * 面试官回合的状态：简报（材料）+ 面试官自己写的计划 + 记忆 + 话题线程 + 消息。纯数据，
 * 本地版从数据库装配，体验版从浏览器存储装配，回合逻辑对两端一视同仁。
 *
 * 流程的主动权在模型：问什么、追不追、什么时候换话题、聊几个项目，都写在它的计划里；
 * 代码只守总回合预算、切段落库和硬停。
 */

/** 面试官计划里的一项：要聊的一个话题，可以对应简报里的一道材料，也可以是候选人自己带出来的东西。 */
export type PlanItem = {
  id: string;
  label: string;
  kind: AreaKind;
  /** 对应简报里的哪道材料；候选人临场提到、简报里没有的为 null。 */
  areaId: string | null;
  /** 打算花几个回合；模型不填为 null。 */
  turns: number | null;
};

export type InterviewPlan = {
  items: PlanItem[];
  /** 模型对这份计划的一句说明（为什么这么排）。 */
  note: string | null;
  revisedAtTurn: number;
};

export type ThreadStatus = "active" | "closed";

/** 一个话题的线程：从面试官进入它到离开它之间的问答。切段、评分、报告都以它为单位。 */
export type ThreadState = {
  id: string;
  /** 对应计划里的哪一项；模型临场进入、计划外的为 null。 */
  planItemId: string | null;
  /** 对应简报里的哪道材料；没有对应材料的为 null（评分表按 kind 兜底）。 */
  areaId: string | null;
  kind: AreaKind;
  label: string;
  /** 进入这个话题时面试官说的话（第一问）。 */
  entryQuestion: string;
  status: ThreadStatus;
  /** 进入之后又问了几轮。 */
  depth: number;
  /** 离开时面试官对这段的判断；进行中、或模型没交代就换了话题的为 null。 */
  verdict: ThreadVerdict | null;
  openedAtTurn: number;
  closedAtTurn: number | null;
  note: string | null;
};

export type MessageRole = "interviewer" | "candidate";
/**
 * 面试官侧：intro_request 开场、question 进入一个话题的那句、probe 话题内的后续、aside 答疑（复述、换个说法、
 * 给方向——题还是原来那道，不算回合）、closing 收尾。
 * 候选人侧：answer 是他说的话（含求助、要求澄清——都交给模型应对），aside 只有代码执行的"结束"。
 */
export type MessageKind = "intro_request" | "question" | "probe" | "closing" | "answer" | "aside";

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
  /** 面试官自己写的计划；开场后第一回合写，之后可改。 */
  plan: InterviewPlan | null;
  threads: ThreadState[];
  messages: MessageState[];
  /** 下一回合的序号；一回合 = 一条候选人消息 + 面试官的回应。 */
  turnIndex: number;
  phase: InterviewPhase;
};

export function activeThread(state: InterviewerState): ThreadState | null {
  return state.threads.find((thread) => thread.status === "active") ?? null;
}

export function areaById(state: InterviewerState, areaId: string | null): InterviewArea | null {
  return areaId ? (state.brief.areas.find((area) => area.id === areaId) ?? null) : null;
}

/** 这个话题所属项目上还没验证的简历假设（项目的任何角度里都能验）；不是项目题时为空。 */
export function openHypotheses(state: InterviewerState, thread: Pick<ThreadState, "areaId">) {
  const projectId = areaById(state, thread.areaId)?.projectId;
  if (!projectId) return [];
  const status = new Map(state.memory.hypotheses.map((item) => [item.id, item.status]));
  return state.brief.hypotheses.filter((item) => item.projectId === projectId && (status.get(item.id) ?? "open") === "open");
}

/** 已结束的线程，按关闭顺序。 */
export function closedThreads(state: InterviewerState): ThreadState[] {
  return state.threads
    .filter((thread) => thread.status !== "active")
    .sort((left, right) => (left.closedAtTurn ?? 0) - (right.closedAtTurn ?? 0));
}

/** 面试官已经说了几回合（含开场，不含答疑）；预算按它算。 */
export function turnsUsed(state: InterviewerState): number {
  return state.messages.filter((message) => message.role === "interviewer" && message.kind !== "aside").length;
}

/** 面试官答疑了几句（不算回合的那些）。 */
export function asidesUsed(state: InterviewerState): number {
  return state.messages.filter((message) => message.role === "interviewer" && message.kind === "aside").length;
}

/**
 * 答疑的软顶：总回合的四分之一（标准节奏 5 句）。超过之后答疑按普通回合数——这是"一场总会结束"
 * 这条底线的一部分，正常用碰不到，不是流程门。
 */
export function asideAllowance(state: InterviewerState): number {
  return Math.ceil(state.brief.turns / 4);
}

export function turnsLeft(state: InterviewerState): number {
  return Math.max(0, state.brief.turns - turnsUsed(state));
}

export type PlanItemStatus = "pending" | "active" | "done";

export function planItemStatus(state: InterviewerState, item: Pick<PlanItem, "id">): PlanItemStatus {
  const threads = state.threads.filter((thread) => thread.planItemId === item.id);
  if (threads.some((thread) => thread.status === "active")) return "active";
  return threads.length > 0 ? "done" : "pending";
}

export function lastInterviewerMessage(state: InterviewerState): MessageState | null {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message.role === "interviewer") return message;
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
  plan: InterviewPlan | null;
  threads: ThreadState[];
  messages: MessageState[];
  ended: boolean;
}): InterviewerState {
  const turnIndex = input.messages.reduce((max, message) => Math.max(max, message.turnIndex + 1), 0);
  return {
    brief: input.brief,
    memory: input.memory,
    plan: input.plan,
    threads: input.threads,
    messages: input.messages,
    turnIndex,
    phase: derivePhase(input.messages, input.ended),
  };
}

/** 读库里 / 文档里的计划；形状不对当没有计划。 */
export function parseStoredPlan(value: unknown): InterviewPlan | null {
  if (!value || typeof value !== "object") return null;
  const plan = value as Partial<InterviewPlan>;
  if (!Array.isArray(plan.items)) return null;
  return {
    items: plan.items.filter((item): item is PlanItem => Boolean(item && typeof item.id === "string" && typeof item.label === "string" && typeof item.kind === "string")),
    note: typeof plan.note === "string" ? plan.note : null,
    revisedAtTurn: typeof plan.revisedAtTurn === "number" ? plan.revisedAtTurn : 0,
  };
}
