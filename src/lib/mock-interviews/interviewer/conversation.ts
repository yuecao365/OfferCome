import type { ModelMessage } from "ai";

import { activeThread, closedThreads, type InterviewerState, type MessageState, type ThreadState } from "./state";

/**
 * 回合 agent 看到的对话原文，按线程对齐而不是按回合数：
 * - 进行中的线程整段保留，切入问答永远在；
 * - 上一条已结束的线程只留最后一问一答与收尾，作为过渡语境；
 * - 不属于线程的话（开场、自我介绍、线程之间的过渡）跟着上一条线程的边界走；
 * - 候选人的插话（跳过 / 再说一遍 / 结束 / 卡住）由代码处理，不进对话；
 * - 总量超过字符上限时从最旧的开始丢，切入问答与最后两条不丢。
 * 更早的内容靠工作记忆与"已结束线程摘要"。
 */

export const CONVERSATION_MAX_CHARS = 6_000;

const ASKING_KINDS = new Set<MessageState["kind"]>(["question", "probe"]);

/** 上一条线程从它最后一个提问起保留；线程外的话从它结束那一回合起保留。 */
function windowStart(messages: MessageState[], previous: ThreadState | null): number {
  if (!previous) return 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.threadId === previous.id && message.role === "interviewer" && ASKING_KINDS.has(message.kind)) return index;
  }
  return 0;
}

function selectWindow(state: InterviewerState, active: ThreadState | null, previous: ThreadState | null): MessageState[] {
  const start = windowStart(state.messages, previous);
  const boundary = previous?.closedAtTurn ?? 0;
  return state.messages.filter((message, index) => {
    if (message.role === "candidate" && message.kind === "aside") return false;
    if (active && message.threadId === active.id) return true;
    if (previous && message.threadId === previous.id) return index >= start;
    if (message.threadId === null) return message.turnIndex >= boundary;
    return false;
  });
}

/** 超出字符上限时从最旧的开始丢，保住切入问答与最后两条。 */
function fitChars(messages: MessageState[], active: ThreadState | null, maxChars: number): MessageState[] {
  const entryIndex = active ? messages.findIndex((m) => m.threadId === active.id && m.kind === "question") : -1;
  const firstAnswerIndex =
    entryIndex >= 0 ? messages.findIndex((m, i) => i > entryIndex && m.role === "candidate" && m.kind === "answer") : -1;
  const keep = new Set([entryIndex, firstAnswerIndex, messages.length - 1, messages.length - 2]);
  let total = messages.reduce((sum, message) => sum + message.content.length, 0);
  const dropped = new Set<number>();
  for (let index = 0; index < messages.length && total > maxChars; index += 1) {
    if (keep.has(index)) continue;
    total -= messages[index].content.length;
    dropped.add(index);
  }
  return messages.filter((_, index) => !dropped.has(index));
}

export function selectConversation(state: InterviewerState, maxChars = CONVERSATION_MAX_CHARS): MessageState[] {
  const active = activeThread(state);
  const previous = closedThreads(state).at(-1) ?? null;
  return fitChars(selectWindow(state, active, previous), active, maxChars);
}

/** 裁剪后相邻的同角色消息合并成一条，保持 user / assistant 交替。 */
export function buildConversation(state: InterviewerState): ModelMessage[] {
  const conversation: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of selectConversation(state)) {
    const role = message.role === "interviewer" ? "assistant" : "user";
    const last = conversation.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n\n${message.content}`;
    else conversation.push({ role, content: message.content });
  }
  return conversation;
}
