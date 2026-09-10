import { evidenceTargetForPace } from "@/lib/mock-interviews/interviewer/brief";
import { buildQuestionTeaching } from "@/lib/mock-interviews/teaching";
import type { MockInterviewTrace, MockInterviewView } from "@/lib/mock-interviews/types";
import { conversationView, traceTurns } from "@/lib/mock-interviews/views";

import type { TrialInterview } from "./interview";

/**
 * 把体验版的会话文档适配成本地版房间 / 报告 / trace 组件吃的视图。
 * 拼装函数与本地版 queries.ts 用的是同一批（views.ts、teaching.ts），组件层感知不到数据来自浏览器还是数据库。
 */

export function trialInterviewToView(interview: TrialInterview): MockInterviewView {
  const closed = interview.questions.length;
  const completed = interview.status === "completed";
  return {
    id: interview.id,
    interviewId: interview.id,
    companyName: interview.job.companyName,
    jobTitle: interview.job.jobTitle,
    status: interview.status,
    generationPhase: interview.generationPhase,
    generationErrorCode: null,
    generationError: interview.generationError,
    interactionMode: "text",
    currentQuestionIndex: closed,
    questionCount: closed,
    totalScore: interview.report?.totalScore ?? null,
    report: interview.report,
    conversation: interview.brief
      ? conversationView({
          brief: interview.brief,
          status: interview.status,
          startedAt: interview.startedAt,
          threads: interview.threads.map((thread) => ({
            ...thread,
            questionId: interview.questions.find((segment) => segment.threadId === thread.id)?.id ?? null,
          })),
          messages: interview.messages,
          memory: interview.memory,
        })
      : null,
    questions: interview.questions.map((segment, index) => ({
      id: segment.id,
      question: segment.question,
      answer: segment.answer ?? "",
      category: segment.category,
      sortOrder: index,
      skipped: segment.skipped,
      ...(completed && segment.evaluation
        ? {
            teaching: buildQuestionTeaching({
              metadata: segment.metadata,
              expectedSignals: segment.expectedSignals,
              sourceKind: segment.sourceKind,
            }),
            evaluation: segment.evaluation,
          }
        : { evaluation: null }),
    })),
  };
}

export function trialInterviewToTrace(interview: TrialInterview): MockInterviewTrace | null {
  if (!interview.brief) return null;
  return {
    id: interview.id,
    companyName: interview.job.companyName,
    jobTitle: interview.job.jobTitle,
    status: interview.status,
    pace: interview.brief.pace,
    evidenceTarget: evidenceTargetForPace(interview.brief.pace),
    areas: interview.brief.areas.map((area) => ({ id: area.id, name: area.name, kind: area.kind, depth: area.depth })),
    turns: traceTurns({
      messages: interview.messages.map((message) => ({ ...message, composeMs: message.metrics?.composeMs ?? null })),
      decisions: interview.decisions,
    }),
  };
}
