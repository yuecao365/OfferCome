import "server-only";

import { after } from "next/server";

import { captureTrialContext, runWithTrialContext } from "@/lib/trial/session";

import { evaluatePersistedMockInterviewQuestion } from "./question-evaluation-service";

export function scheduleMockInterviewQuestionEvaluation(
  interviewQuestionId: string,
): void {
  // 体验模式上下文必须在请求内捕获，after() 里再装回（见 generation-background）。
  const trialContext = captureTrialContext();
  after(async () => {
    try {
      await runWithTrialContext(await trialContext, () =>
        evaluatePersistedMockInterviewQuestion(interviewQuestionId),
      );
    } catch (error) {
      console.error("后台逐题评分失败，交卷时将自动补评。", error);
    }
  });
}
