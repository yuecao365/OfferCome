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
 * 实习/项目条目来自浏览器里的体验简历（workspace.resume.projects），
 * 与本地版一样支持按单个项目聚焦与归类调整。
 */

function reviewRows(
  workspace: TrialWorkspace,
  source: InterviewReviewFilters["source"],
): QuestionReviewSource[] {
  const projectIds = new Set(
    (workspace.resume?.projects ?? []).map((project) => project.id),
  );
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
          // 项目被删除后关联失效，按"未关联"处理。
          resumeProjectId:
            question.resumeProjectId && projectIds.has(question.resumeProjectId)
              ? question.resumeProjectId
              : null,
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
  const countsByProjectId = new Map<string, number>();
  for (const row of rows) {
    const category = normalizeQuestionCategory(row.category);
    countsByCategory.set(category, (countsByCategory.get(category) ?? 0) + 1);
    if (category === "resume_project") {
      const key = row.resumeProjectId ?? "unlinked";
      countsByProjectId.set(key, (countsByProjectId.get(key) ?? 0) + 1);
    }
  }

  const projects = (workspace.resume?.projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    type: project.type,
    organization: project.organization,
    description: project.description || null,
    questionCount: countsByProjectId.get(project.id) ?? 0,
  }));

  const scoped =
    filters.section === "projects" && filters.projectId
      ? rows.filter(
          (row) =>
            normalizeQuestionCategory(row.category) === "resume_project" &&
            (filters.projectId === "unlinked"
              ? row.resumeProjectId === null
              : row.resumeProjectId === filters.projectId),
        )
      : filters.section === "question_bank" && filters.category
        ? rows.filter(
            (row) => normalizeQuestionCategory(row.category) === filters.category,
          )
        : null;

  return {
    projects,
    unlinkedProjectQuestionCount: countsByProjectId.get("unlinked") ?? 0,
    technicalQuestionCount: countsByCategory.get("technical") ?? 0,
    generalQuestionCount: countsByCategory.get("general") ?? 0,
    selectedProject:
      filters.section === "projects" && filters.projectId
        ? (projects.find((project) => project.id === filters.projectId) ?? null)
        : null,
    questionsPage: paginateQuestionReviewItems(
      scoped ? groupQuestionReviewItems(scoped) : [],
      filters.page,
    ),
  };
}

/** 与本地版 reclassifyInterviewQuestions 同责的浏览器实现。 */
export function reclassifyTrialQuestions(
  workspace: TrialWorkspace,
  input: { questionIds: string[]; category: string; resumeProjectId: string | null },
): { workspace: TrialWorkspace; count: number; missingProject: boolean } {
  const resumeProjectId =
    input.category === "resume_project" ? input.resumeProjectId : null;
  if (
    resumeProjectId &&
    !(workspace.resume?.projects ?? []).some(
      (project) => project.id === resumeProjectId,
    )
  ) {
    return { workspace, count: 0, missingProject: true };
  }

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
        return { ...question, category: input.category, resumeProjectId };
      }),
    };
  });
  return {
    workspace: { ...workspace, interviews },
    count,
    missingProject: false,
  };
}
