import "server-only";

import { after } from "next/server";

import { captureTrialContext, runWithTrialContext } from "@/lib/trial/session";

import { generateMockInterviewQuestions } from "./service";

export function scheduleMockInterviewGeneration(sessionId: string): void {
  // 体验模式的会话与 AI Key 都挂在请求 cookie 上，而 after() 里请求已经
  // 结束——必须在这里（仍在请求内）先捕获，回调里重新装回。非体验模式
  // 下捕获结果是 null，行为不变。
  const trialContext = captureTrialContext();
  after(async () => {
    try {
      await runWithTrialContext(await trialContext, () =>
        generateMockInterviewQuestions(sessionId),
      );
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
