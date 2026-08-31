import type { MockInterviewView } from "@/lib/mock-interviews/types";

import type { TrialInterview } from "./interview";
import type { TrialWorkspaceInterview } from "./workspace";

/**
 * 把体验版的两种数据形态适配成本地版房间/报告组件吃的 MockInterviewView：
 * - 进行中的会话文档（sessionStorage）；
 * - 已完成后写入工作台的模拟面试记录（localStorage）。
 * 组件层由此完全感知不到数据来自浏览器还是数据库。
 */

export function trialInterviewToView(interview: TrialInterview): MockInterviewView {
  return {
    id: interview.id,
    interviewId: interview.id,
    companyName: interview.job.companyName,
    jobTitle: interview.job.jobTitle,
    status: interview.status,
    generationPhase: null,
    generationErrorCode: null,
    generationError: null,
    interactionMode: "text",
    currentQuestionIndex: interview.currentIndex,
    questionCount: interview.questions.length,
    totalScore: interview.report?.totalScore ?? null,
    report: interview.report,
    questions: interview.questions.map((question, index) => ({
      id: question.uid,
      question: question.question,
      answer: interview.answers[index] ?? "",
      category: question.category,
      sortOrder: index,
      skipped: interview.answers[index] === "",
      isFollowUp: question.parentIndex !== null,
      parentQuestionId:
        question.parentIndex !== null
          ? (interview.questions[question.parentIndex]?.uid ?? null)
          : null,
      evaluation: interview.evaluations[index],
    })),
  };
}

/** 已完成的模拟面试从工作台记录还原成报告视图。 */
export function trialMockRecordToView(
  record: TrialWorkspaceInterview,
): MockInterviewView {
  return {
    id: record.id,
    interviewId: record.id,
    companyName: record.companyName,
    jobTitle: record.jobTitle,
    status: "completed",
    generationPhase: null,
    generationErrorCode: null,
    generationError: null,
    interactionMode: "text",
    currentQuestionIndex: record.questions.length,
    questionCount: record.questions.length,
    totalScore: record.totalScore,
    report: record.report,
    questions: record.questions.map((question, index) => ({
      id: question.id,
      question: question.question,
      answer: question.answer,
      category: question.category,
      sortOrder: index,
      skipped: question.answer === "",
      isFollowUp: false,
      parentQuestionId: null,
      evaluation:
        question.score == null
          ? null
          : {
              score: question.score,
              dimensions: [],
              strengths: [],
              improvements: [],
              feedback: question.feedback ?? "",
            },
    })),
  };
}
