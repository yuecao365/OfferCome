import {
  groupQuestionReviewItems,
  paginateQuestionReviewItems,
  type InterviewReviewFilters,
  type InterviewReviewPageData,
  type QuestionReviewSource,
} from "@/lib/interviews/review";
import { normalizeQuestionCategory } from "@/lib/interviews/types";

import type { TrialWorkspace } from "./workspace";

/**
 * 体验版的面试复盘查询：把工作台面试记录铺成与本地版数据库行相同的
 * QuestionReviewSource，之后的聚合、相似合并、分页全部复用本地版纯函数——
 * 两个版本对"什么算同一道题"的判断永远一致。
 *
 * 体验版没有简历项目实体，所以实习/项目问题全部归入"未关联"。
 */

function reviewRows(
  workspace: TrialWorkspace,
  source: InterviewReviewFilters["source"],
): QuestionReviewSource[] {
  return workspace.interviews
    // 与本地版同一道闸：只有已完成的面试参与复盘，进行中的题目不外泄。
    .filter(
      (interview) =>
        interview.status === "completed" &&
        (source === "all" || interview.kind === source),
    )
    .flatMap((interview) =>
      interview.questions
        .filter((question) => question.question.trim() && question.answer.trim())
        .map((question) => ({
          id: question.id,
          question: question.question,
          answer: question.answer,
          category: question.category,
          resumeProjectId: null,
          sortOrder: question.sortOrder,
          createdAt: new Date(interview.createdAt),
          updatedAt: new Date(interview.updatedAt),
          interview: {
            id: interview.id,
            companyName: interview.companyName,
            jobTitle: interview.jobTitle,
            interviewedAt: interview.interviewedAt
              ? new Date(interview.interviewedAt)
              : null,
            scheduledAt: null,
            round: interview.round,
            kind: interview.kind,
          },
        })),
    );
}

export function trialReviewPageData(
  workspace: TrialWorkspace,
  filters: InterviewReviewFilters,
): InterviewReviewPageData {
  const rows = reviewRows(workspace, filters.source);
  const countsByCategory = new Map<string, number>();
  for (const row of rows) {
    const category = normalizeQuestionCategory(row.category);
    countsByCategory.set(category, (countsByCategory.get(category) ?? 0) + 1);
  }

  const scoped =
    filters.section === "projects" && filters.projectId === "unlinked"
      ? rows.filter(
          (row) => normalizeQuestionCategory(row.category) === "resume_project",
        )
      : filters.section === "question_bank" && filters.category
        ? rows.filter(
            (row) => normalizeQuestionCategory(row.category) === filters.category,
          )
        : null;

  return {
    projects: [],
    unlinkedProjectQuestionCount: countsByCategory.get("resume_project") ?? 0,
    technicalQuestionCount: countsByCategory.get("technical") ?? 0,
    generalQuestionCount: countsByCategory.get("general") ?? 0,
    selectedProject: null,
    questionsPage: paginateQuestionReviewItems(
      scoped ? groupQuestionReviewItems(scoped) : [],
      filters.page,
    ),
  };
}

/** 与本地版 reclassifyInterviewQuestions 同责的浏览器实现。 */
export function reclassifyTrialQuestions(
  workspace: TrialWorkspace,
  input: { questionIds: string[]; category: string },
): { workspace: TrialWorkspace; count: number } {
  const ids = new Set(input.questionIds);
  let count = 0;
  const interviews = workspace.interviews.map((interview) => {
    if (!interview.questions.some((question) => ids.has(question.id))) {
      return interview;
    }
    return {
      ...interview,
      questions: interview.questions.map((question) => {
        if (!ids.has(question.id)) return question;
        count += 1;
        return { ...question, category: input.category };
      }),
    };
  });
  return { workspace: { ...workspace, interviews }, count };
}
