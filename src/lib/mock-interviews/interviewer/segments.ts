import type { MessageState, ThreadState } from "./state";

/**
 * 线程 → 对话段。关闭线程时由代码确定性地切出：
 * 题目 = 切入问题 + 追问（含打断），回答 = 候选人在该线程内的全部实质回答
 * （对题目的提问与澄清不算）。这一段写成 InterviewQuestion，评分、复盘、画像照旧。
 */

export type ThreadSegment = {
  question: string;
  answer: string;
  skipped: boolean;
  probeCount: number;
  /** 候选人在这条线程里的作答总时长（秒）；没有记录时为 null。只作辅助信号。 */
  answerSeconds: number | null;
};

export function threadSegment(thread: ThreadState, messages: MessageState[]): ThreadSegment {
  const own = messages.filter((message) => message.threadId === thread.id);
  const probes = own.filter(
    (message) => message.role === "interviewer" && (message.kind === "probe" || message.kind === "interrupt"),
  );
  const answers = own.filter((message) => message.role === "candidate" && message.kind === "answer");
  const answerText = answers.map((message) => message.content.trim()).filter(Boolean);
  const question = [
    thread.entryQuestion.trim(),
    ...probes.map((probe, index) => `追问 ${index + 1}：${probe.content.trim()}`),
  ].join("\n");
  const answer = answerText.join("\n\n");
  const timed = answers.map((message) => message.metrics?.composeMs ?? null).filter((value): value is number => value !== null);
  return {
    question,
    answer,
    skipped: thread.status === "skipped" || answer.length === 0,
    probeCount: probes.length,
    answerSeconds: timed.length > 0 ? Math.round(timed.reduce((sum, value) => sum + value, 0) / 1000) : null,
  };
}

/** 给提示词看的已结束线程摘要：不带原文，只带判断。 */
export function closedThreadSummary(thread: ThreadState, areaName: string): string {
  const verdict = thread.status === "skipped" ? "候选人跳过" : thread.note ?? "已结束";
  return `- ${areaName}（${thread.depth} 层追问）：${verdict}`;
}
