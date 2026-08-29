import "server-only";

import { after } from "next/server";

import { evaluatePersistedMockInterviewQuestion } from "./question-evaluation-service";

export function scheduleMockInterviewQuestionEvaluation(
  interviewQuestionId: string,
): void {
  after(async () => {
    try {
      await evaluatePersistedMockInterviewQuestion(interviewQuestionId);
    } catch (error) {
      console.error("后台逐题评分失败，交卷时将自动补评。", error);
    }
  });
}
