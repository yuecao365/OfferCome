import type { ModelMessage } from "ai";

import type { InterviewerState, MessageState } from "./state";

/**
 * 回合 agent 看到的对话原文：整场只追加，不按话题裁剪。
 *
 * 历史消息只留双方说的话，每回合发给模型的内容只在末尾多一条——前缀稳定，provider 的提示词缓存才命中。
 * 超过字符上限时从最旧的整条丢（最后两条不丢）；标准节奏一场用不满上限，deep 节奏晚期才会丢。
 * 候选人由代码执行的"结束"插话不进对话（那一回合本来就不调模型）。更早被丢掉的内容靠工作记忆与"已结束的话题"。
 */

export const CONVERSATION_MAX_CHARS = 12_000;

export function selectConversation(state: InterviewerState, maxChars = CONVERSATION_MAX_CHARS): MessageState[] {
  const messages = state.messages.filter((message) => !(message.role === "candidate" && message.kind === "aside"));
  let total = messages.reduce((sum, message) => sum + message.content.length, 0);
  let start = 0;
  while (total > maxChars && start < messages.length - 2) {
    total -= messages[start].content.length;
    start += 1;
  }
  return messages.slice(start);
}

/** 相邻的同角色消息合并成一条，保持 user / assistant 交替。 */
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
