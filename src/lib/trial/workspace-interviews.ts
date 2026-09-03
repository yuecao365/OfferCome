import {
  buildApplicationTrend,
  getApplicationTrendStart,
  toApplicationStageCounts,
} from "@/lib/applications/analytics";
import type { ApplicationTrendRange } from "@/lib/applications/types";
import {
  toRealInterviewRoundCounts,
  toRealInterviewStatusCounts,
} from "@/lib/interviews/analytics";
import {
  INTERVIEW_HISTORY_PAGE_SIZE,
  deriveRealInterviewStatus,
  normalizeInterviewRound,
  normalizeInterviewStatus,
  toInterviewStats,
  type InterviewFilters,
  type InterviewFormValue,
  type InterviewListItem,
  type InterviewStats,
  type InterviewStatusCount,
} from "@/lib/interviews/types";
import type { UpcomingInterviews } from "@/lib/interviews/upcoming";
import type { MockInterviewReport } from "@/lib/mock-interviews/types";

import type { TrialWorkspace, TrialWorkspaceInterview } from "./workspace";

/**
 * 体验版工作台的面试查询与统计。
 *
 * 全部是纯函数，口径**引用**本地版的实现（toInterviewStats、
 * deriveRealInterviewStatus、buildApplicationTrend 等）而不是复制——
 * 本地版改口径，体验版自动跟着变。输出形状与本地版 queries 一致，
 * 页面组件感知不到数据来自哪里。
 */

/* ------------------------------ 面试操作 ------------------------------ */

export function upsertInterview(
  workspace: TrialWorkspace,
  value: InterviewFormValue,
  id?: string,
): TrialWorkspace {
  const now = new Date().toISOString();
  const existing = id
    ? workspace.interviews.find((item) => item.id === id)
    : undefined;

  const record: TrialWorkspaceInterview = {
    id: existing?.id ?? crypto.randomUUID(),
    kind: existing?.kind ?? "real",
    companyName: value.companyName,
    jobTitle: value.jobTitle,
    round: value.round,
    // 与本地版同一条规则：状态由面试时间推导。
    status: deriveRealInterviewStatus(value.interviewedAt),
    interviewedAt: value.interviewedAt.toISOString(),
    note: value.note,
    questions: value.questions.map((question, index) => ({
      id: question.id ?? crypto.randomUUID(),
      question: question.question,
      answer: question.answer,
      category: question.category,
      resumeProjectId: question.resumeProjectId ?? null,
      sortOrder: index,
    })),
    totalScore: existing?.totalScore ?? null,
    report: existing?.report ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return {
    ...workspace,
    interviews: existing
      ? workspace.interviews.map((item) => (item.id === record.id ? record : item))
      : [record, ...workspace.interviews],
  };
}

export function deleteInterview(
  workspace: TrialWorkspace,
  id: string,
): TrialWorkspace {
  return {
    ...workspace,
    interviews: workspace.interviews.filter((item) => item.id !== id),
  };
}

/** 体验版完成一场模拟面试后写入历史，供列表、复盘与画像使用。 */
export function addCompletedMockInterview(
  workspace: TrialWorkspace,
  input: {
    /** 复用会话 id，让历史列表的"打开"链接能找回这场面试。 */
    id?: string;
    companyName: string;
    jobTitle: string;
    questions: {
      question: string;
      answer: string | null;
      category: string;
      score: number | null;
      feedback: string | null;
    }[];
    totalScore: number;
    report: MockInterviewReport;
  },
): TrialWorkspace {
  const now = new Date().toISOString();
  const record: TrialWorkspaceInterview = {
    id: input.id ?? crypto.randomUUID(),
    kind: "mock",
    companyName: input.companyName,
    jobTitle: input.jobTitle,
    round: null,
    status: "completed",
    interviewedAt: now,
    note: "AI 模拟面试",
    questions: input.questions.map((question, index) => ({
      id: crypto.randomUUID(),
      question: question.question,
      answer: question.answer ?? "",
      category: question.category === "resume_project" ? "resume_project" : question.category === "technical" ? "technical" : "general",
      sortOrder: index,
      score: question.score,
      feedback: question.feedback,
    })),
    totalScore: input.totalScore,
    report: input.report,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...workspace,
    interviews: [
      record,
      ...workspace.interviews.filter((item) => item.id !== record.id),
    ],
  };
}

/* ------------------------------ 查询适配 ------------------------------ */

export function toInterviewListItem(
  record: TrialWorkspaceInterview,
  projectNames: Map<string, string> = new Map(),
): InterviewListItem {
  return {
    id: record.id,
    kind: record.kind,
    // 体验版的模拟面试没有独立会话表，直接以记录 id 作为会话 id。
    mockSessionId: record.kind === "mock" ? record.id : null,
    companyName: record.companyName,
    jobTitle: record.jobTitle,
    interviewedAt: record.interviewedAt ? new Date(record.interviewedAt) : null,
    round: normalizeInterviewRound(record.round),
    status: normalizeInterviewStatus(record.status),
    note: record.note,
    questionCount: record.questions.length,
    updatedAt: new Date(record.updatedAt),
    questions: record.questions.map((question) => ({
      id: question.id,
      question: question.question,
      answer: question.answer,
      category:
        question.category === "resume_project" || question.category === "technical"
          ? question.category
          : "general",
      resumeProjectId: question.resumeProjectId ?? null,
      resumeProjectName: question.resumeProjectId
        ? (projectNames.get(question.resumeProjectId) ?? null)
        : null,
      sortOrder: question.sortOrder,
    })),
  };
}

export function queryInterviews(
  workspace: TrialWorkspace,
  filters: InterviewFilters,
): { interviews: InterviewListItem[]; total: number; totalPages: number; page: number } {
  const query = filters.q.toLowerCase();

  const matched = workspace.interviews.filter((item) => {
    if (filters.kind !== "all" && item.kind !== filters.kind) return false;
    if (
      filters.status !== "all" &&
      normalizeInterviewStatus(item.status) !== filters.status
    ) {
      return false;
    }
    if (filters.round !== "all" && item.round !== filters.round) return false;
    if (
      filters.category !== "all" &&
      !item.questions.some((question) => question.category === filters.category)
    ) {
      return false;
    }
    if (
      query &&
      !item.companyName.toLowerCase().includes(query) &&
      !item.jobTitle.toLowerCase().includes(query) &&
      !item.questions.some((question) =>
        question.question.toLowerCase().includes(query),
      )
    ) {
      return false;
    }
    return true;
  });

  const direction = filters.sort === "oldest" ? 1 : -1;
  const sorted = matched.toSorted(
    (left, right) =>
      direction *
      (new Date(left.interviewedAt ?? left.updatedAt).getTime() -
        new Date(right.interviewedAt ?? right.updatedAt).getTime()),
  );

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / INTERVIEW_HISTORY_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * INTERVIEW_HISTORY_PAGE_SIZE;

  const projectNames = new Map(
    (workspace.resume?.projects ?? []).map((project) => [project.id, project.name]),
  );
  return {
    interviews: sorted
      .slice(start, start + INTERVIEW_HISTORY_PAGE_SIZE)
      .map((record) => toInterviewListItem(record, projectNames)),
    total,
    totalPages,
    page,
  };
}

/* ------------------------------ 统计适配 ------------------------------ */

function statusRows(records: TrialWorkspaceInterview[]): InterviewStatusCount[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => ({
    status,
    _count: { _all: count },
  }));
}

export function interviewStats(workspace: TrialWorkspace): InterviewStats {
  return toInterviewStats(
    statusRows(workspace.interviews.filter((item) => item.kind === "real")),
  );
}

/** 与本地版 getInterviewWorkspaceData 相同的返回形状。 */
export function interviewWorkspaceOverview(workspace: TrialWorkspace) {
  const real = workspace.interviews.filter((item) => item.kind === "real");
  const completedMocks = workspace.interviews.filter(
    (item) => item.kind === "mock" && item.status === "completed",
  );
  const scores = completedMocks
    .map((item) => item.totalScore)
    .filter((score): score is number => score !== null);

  const recent = workspace.interviews
    .toSorted(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, 3)
    .map((interview) => ({
      id: interview.id,
      mockSessionId: interview.kind === "mock" ? interview.id : null,
      kind: interview.kind,
      companyName: interview.companyName,
      jobTitle: interview.jobTitle,
      status: normalizeInterviewStatus(interview.status),
      round: normalizeInterviewRound(interview.round),
      occurredAt: new Date(interview.interviewedAt ?? interview.updatedAt),
      questionCount: interview.questions.length,
      score: interview.totalScore ?? null,
    }));

  return {
    recent,
    completedMockCount: completedMocks.length,
    averageMockScore:
      scores.length === 0
        ? null
        : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    realInterviewCounts: toRealInterviewStatusCounts(statusRows(real)),
    realInterviewRoundCounts: toRealInterviewRoundCounts(
      real.map((item) => ({ round: item.round, _count: { _all: 1 } })),
    ),
  };
}

/** 与本地版 getUpcomingInterviews 相同的分类语义。 */
const RECENTLY_FINISHED_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const UPCOMING_LIMIT = 5;

export function upcomingInterviews(
  workspace: TrialWorkspace,
  now: Date = new Date(),
): UpcomingInterviews {
  const scheduled = workspace.interviews.filter(
    (item): item is TrialWorkspaceInterview & { interviewedAt: string } =>
      item.kind === "real" && item.status === "scheduled" && item.interviewedAt !== null,
  );
  const entry = (item: TrialWorkspaceInterview & { interviewedAt: string }) => ({
    id: item.id,
    companyName: item.companyName,
    jobTitle: item.jobTitle,
    round: normalizeInterviewRound(item.round),
    interviewedAt: new Date(item.interviewedAt),
  });

  return {
    upcoming: scheduled
      .filter((item) => new Date(item.interviewedAt) > now)
      .toSorted((a, b) => a.interviewedAt.localeCompare(b.interviewedAt))
      .slice(0, UPCOMING_LIMIT)
      .map(entry),
    awaitingRecord: scheduled
      .filter((item) => {
        const at = new Date(item.interviewedAt);
        return at <= now && at >= new Date(now.getTime() - RECENTLY_FINISHED_WINDOW_MS);
      })
      .toSorted((a, b) => b.interviewedAt.localeCompare(a.interviewedAt))
      .slice(0, UPCOMING_LIMIT)
      .map(entry),
  };
}

/* ------------------------- 仪表盘的投递统计适配 ------------------------- */

/** 与本地版 getApplicationStageSnapshot().stageCounts 相同的统计口径。 */
export function applicationStageCounts(workspace: TrialWorkspace) {
  return toApplicationStageCounts(
    workspace.applications.map((item) => ({ stage: item.stage, _count: { _all: 1 } })),
  );
}

export function applicationStats(
  workspace: TrialWorkspace,
  trendRange: ApplicationTrendRange,
  now: Date = new Date(),
) {
  const applications = workspace.applications;
  const appliedDates = applications.map((item) => new Date(item.appliedAt));
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);

  const sourceCountMap = new Map<string, number>();
  for (const item of applications) {
    sourceCountMap.set(item.source, (sourceCountMap.get(item.source) ?? 0) + 1);
  }

  return {
    total: applications.length,
    recent7Days: appliedDates.filter((date) => date >= sevenDaysAgo).length,
    // 体验版没有同步渠道。
    latestSyncedAt: null,
    stageCounts: applicationStageCounts(workspace),
    recentApplications: applications
      .toSorted(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )
      .slice(0, 5)
      .map((item) => ({
        ...item,
        appliedAt: new Date(item.appliedAt),
        lastSeenAt: new Date(item.updatedAt),
        statusUpdatedAt: new Date(item.updatedAt),
        updatedAt: new Date(item.updatedAt),
        autoRejectedAt: null,
      })),
    trend: buildApplicationTrend(
      appliedDates,
      getApplicationTrendStart(now, trendRange),
      trendRange,
    ),
    sourceCounts: [...sourceCountMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .toSorted((left, right) => right.count - left.count),
  };
}
