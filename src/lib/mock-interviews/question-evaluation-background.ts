import "server-only";

import { after } from "next/server";

import { completeMockInterview } from "./completion";
import { evaluatePersistedMockInterviewQuestion } from "./question-evaluation-service";

/** 线程关闭后在响应返回后跑逐题评分；失败的交卷时补评。 */
export function scheduleMockInterviewQuestionEvaluation(interviewQuestionId: string): void {
  after(async () => {
    try {
      await evaluatePersistedMockInterviewQuestion(interviewQuestionId);
    } catch (error) {
      console.error("后台逐题评分失败，交卷时将自动补评。", error);
    }
  });
}

/** 面试结束后自动生成报告；失败时会话退回 ready_to_evaluate，房间给重试入口。 */
export function scheduleMockInterviewCompletion(sessionId: string): void {
  after(async () => {
    try {
      await completeMockInterview(sessionId);
    } catch (error) {
      console.error("自动生成面试报告失败，可在房间里重试。", error);
    }
  });
}
