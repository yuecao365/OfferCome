import "server-only";

import { after } from "next/server";

import { generateMockInterviewQuestions } from "./service";

export function scheduleMockInterviewGeneration(sessionId: string): void {
  after(async () => {
    try {
      await generateMockInterviewQuestions(sessionId);
    } catch (error) {
      // 出题内部已把可预期失败写进会话状态；能漏到这里的都是意外错误。
      // 不接住会变成未处理的 Promise 拒绝，可能直接带崩进程。
      console.error(
        `后台出题失败，会话 ${sessionId} 可能停留在生成中状态。`,
        error,
      );
    }
  });
}
