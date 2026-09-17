import { planQuota } from "@/lib/interview/progress";
import { conversationView, traceTurns } from "@/lib/interview/views";
import { buildQuestionTeaching } from "@/lib/mock-interviews/teaching";
import type { MockInterviewTrace, MockInterviewView } from "@/lib/mock-interviews/types";

import type { TrialInterview } from "./interview";

/**
 * 把体验版的会话文档适配成本地版房间 / 报告 / trace 组件吃的视图。
 * 拼装函数与本地版 queries.ts 用的是同一批（interview/views.ts、teaching.ts），组件层感知不到数据来自浏览器还是数据库。
 */

export function trialInterviewToView(interview: TrialInterview): MockInterviewView {
  const completed = interview.status === "completed";
  return {
    id: interview.id,
    interviewId: interview.id,
    companyName: interview.job.companyName,
    jobTitle: interview.job.jobTitle,
    business: interview.blueprint?.business ?? null,
    status: interview.status,
    generationPhase: interview.generationPhase,
    generationErrorCode: null,
    generationError: interview.generationError,
    interactionMode: "text",
    questionCount: interview.questions.length,
    totalScore: interview.report?.totalScore ?? null,
    report: interview.report,
    // 体验版不留档案（没有服务端存储）。
    dossier: null,
    materials: { resumeText: interview.resume.text, jobDescription: interview.job.jobDescription },
    conversation: interview.brief
      ? conversationView({ brief: interview.brief, status: interview.status, startedAt: interview.startedAt, notebook: interview.notebook, messages: interview.messages })
      : null,
    estimates: [],
    questions: interview.questions.map((segment, index) => ({
      id: segment.id,
      question: segment.question,
      answer: segment.answer ?? "",
      category: segment.category,
      sortOrder: index,
      skipped: segment.skipped,
      ...(completed && segment.evaluation
        ? { teaching: buildQuestionTeaching({ metadata: segment.metadata, expectedSignals: segment.expectedSignals, sourceKind: segment.sourceKind }), evaluation: segment.evaluation }
        : { evaluation: null }),
    })),
  };
}

/** 体验版没有事件日志：trace 从消息投影拼，没有笔记与开销。 */
export function trialInterviewToTrace(interview: TrialInterview): MockInterviewTrace | null {
  if (!interview.brief) return null;
  return {
    id: interview.id,
    companyName: interview.job.companyName,
    jobTitle: interview.job.jobTitle,
    status: interview.status,
    pace: interview.brief.pace,
    plan: planQuota(interview.brief),
    areas: interview.brief.areas.map((area) => ({ id: area.id, name: area.name, kind: area.kind })),
    competencies: [],
    flags: { policy: "v2", shadow: null, lab: false },
    postmortem: null,
    agents: [],
    rows: traceTurns(
      interview.messages.map((message) => ({
        type: message.role === "candidate" ? "candidate_said" : "interviewer_said",
        payload: { content: message.content, kind: message.kind, control: message.kind === "control" ? "hint" : null, composeMs: null },
        runId: null,
      })),
    ),
  };
}
