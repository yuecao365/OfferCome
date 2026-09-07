import type { MessageState, ThreadState } from "./state";

/**
 * 线程 → 对话段。关闭线程时由代码确定性地切出：
 * 题目 = 切入问题 + 追问，回答 = 候选人在该线程内的全部消息。
 * 这一段写成 InterviewQuestion，评分、复盘、画像照旧。
 */

export type ThreadSegment = {
  question: string;
  answer: string;
  skipped: boolean;
  probeCount: number;
};

export function threadSegment(thread: ThreadState, messages: MessageState[]): ThreadSegment {
  const own = messages.filter((message) => message.threadId === thread.id);
  const probes = own.filter((message) => message.role === "interviewer" && message.kind === "probe");
  const answers = own
    .filter((message) => message.role === "candidate" && message.kind === "answer")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const question = [
    thread.entryQuestion.trim(),
    ...probes.map((probe, index) => `追问 ${index + 1}：${probe.content.trim()}`),
  ].join("\n");
  const answer = answers.join("\n\n");
  return {
    question,
    answer,
    skipped: thread.status === "skipped" || answer.length === 0,
    probeCount: probes.length,
  };
}

/** 给提示词看的已结束线程摘要：不带原文，只带判断。 */
export function closedThreadSummary(
  thread: ThreadState,
  areaName: string,
): string {
  const verdict = thread.status === "skipped" ? "候选人跳过" : thread.note ?? "已结束";
  return `- ${areaName}（${thread.depth} 层追问）：${verdict}`;
}
