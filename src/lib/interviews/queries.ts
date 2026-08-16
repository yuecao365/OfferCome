import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import {
  type InterviewFilters,
  type InterviewListItem,
  type InterviewStats,
  type ResumeProjectOption,
  normalizeInterviewRound,
  normalizeInterviewStatus,
  normalizeQuestionCategory,
} from "./types";
import {
  groupQuestionReviewItems,
  paginateQuestionReviewItems,
  type InterviewReviewFilters,
  type QuestionReviewPage,
} from "./review";
import {
  toRealInterviewRoundCounts,
  toRealInterviewStatusCounts,
} from "./analytics";

const INTERVIEW_INCLUDE = {
  mockSession: {
    select: { id: true },
  },
  questions: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      question: true,
      answer: true,
      category: true,
      resumeProjectId: true,
      sortOrder: true,
      resumeProject: {
        select: {
          name: true,
        },
      },
    },
  },
  _count: {
    select: { questions: true },
  },
} satisfies Prisma.InterviewInclude;

type InterviewRow = Prisma.InterviewGetPayload<{ include: typeof INTERVIEW_INCLUDE }>;

type InterviewStatusCount = {
  status: string;
  _count: { _all: number };
};

const OFFER_STATUSES = new Set(["offer", "offered"]);
const PASSED_STATUSES = new Set([
  "completed",
  "passed",
  "advanced",
  "next_round",
  ...OFFER_STATUSES,
]);
const FAILED_STATUSES = new Set([
  "canceled",
  "cancelled",
  "failed",
  "rejected",
  "not_passed",
]);
const PREPARING_STATUSES = new Set(["scheduled", "preparing"]);
const ACTIVE_STATUSES = new Set([
  "in_progress",
  "first_interview",
  "second_interview",
  "third_interview",
  "hr_interview",
]);

export function toInterviewStats(rows: InterviewStatusCount[]): InterviewStats {
  const stats: InterviewStats = {
    total: 0,
    offers: 0,
    passed: 0,
    failed: 0,
    preparing: 0,
    active: 0,
  };

  for (const row of rows) {
    const status = row.status.trim().toLowerCase();
    const count = row._count._all;

    stats.total += count;
    if (OFFER_STATUSES.has(status)) stats.offers += count;
    if (PASSED_STATUSES.has(status)) stats.passed += count;
    if (FAILED_STATUSES.has(status)) stats.failed += count;
    if (PREPARING_STATUSES.has(status)) stats.preparing += count;
    if (ACTIVE_STATUSES.has(status)) stats.active += count;
  }

  return stats;
}

export function toInterviewListItem(row: InterviewRow): InterviewListItem {
  return {
    id: row.id,
    kind: row.kind === "mock" ? "mock" : "real",
    mockSessionId: row.mockSession?.id ?? null,
    companyName: row.companyName,
    jobTitle: row.jobTitle,
    interviewedAt: row.interviewedAt ?? row.scheduledAt,
    round: normalizeInterviewRound(row.round),
    status:
      row.kind === "mock" ? normalizeInterviewStatus(row.status) : "completed",
    note: row.note ?? "",
    questionCount: row._count.questions,
    updatedAt: row.updatedAt,
    questions: row.questions.map((question) => ({
      id: question.id,
      question: question.question,
      answer: question.answer ?? "",
      category: normalizeQuestionCategory(question.category),
      resumeProjectId: question.resumeProjectId,
      resumeProjectName: question.resumeProject?.name ?? null,
      sortOrder: question.sortOrder,
    })),
  };
}

function buildInterviewWhere(filters: InterviewFilters): Prisma.InterviewWhereInput {
  const where: Prisma.InterviewWhereInput = {};

  if (filters.q) {
    where.OR = [
      { companyName: { contains: filters.q } },
      { jobTitle: { contains: filters.q } },
      { questions: { some: { question: { contains: filters.q } } } },
    ];
  }

  if (filters.status !== "all") {
    where.status = filters.status;
  }

  if (filters.round !== "all") {
    where.round = filters.round;
  }

  if (filters.category !== "all") {
    where.questions = { some: { category: filters.category } };
  }

  return where;
}

export async function getInterviews(
  filters: InterviewFilters = {
    q: "",
    status: "all",
    round: "all",
    category: "all",
    sort: "newest",
  },
): Promise<InterviewListItem[]> {
  const rows = await prisma.interview.findMany({
    where: buildInterviewWhere(filters),
    include: INTERVIEW_INCLUDE,
    orderBy:
      filters.sort === "oldest"
        ? [{ interviewedAt: "asc" }, { scheduledAt: "asc" }, { updatedAt: "asc" }]
        : [
            { interviewedAt: "desc" },
            { scheduledAt: "desc" },
            { updatedAt: "desc" },
          ],
  });

  return rows.map(toInterviewListItem);
}

export async function getResumeProjectOptions(): Promise<ResumeProjectOption[]> {
  return prisma.resumeProject.findMany({
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export async function getInterviewDraftProjectOptions(): Promise<
  {
    id: string;
    name: string;
    type: string;
    organization: string;
  }[]
> {
  const projects = await prisma.resumeProject.findMany({
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, organization: true },
  });

  return projects.map((project) => ({
    ...project,
    organization: project.organization ?? "",
  }));
}

export async function getInterviewStats(): Promise<InterviewStats> {
  const rows = await prisma.interview.groupBy({
    by: ["status"],
    where: { kind: "real" },
    _count: { _all: true },
  });

  return toInterviewStats(rows);
}

export async function getInterviewWorkspaceData() {
  const [recent, mockSummary, realStatusGroups, realRoundGroups] = await Promise.all([
    prisma.interview.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 3,
      select: {
        id: true,
        kind: true,
        companyName: true,
        jobTitle: true,
        status: true,
        round: true,
        interviewedAt: true,
        scheduledAt: true,
        updatedAt: true,
        mockSession: { select: { id: true, totalScore: true } },
        _count: { select: { questions: true } },
      },
    }),
    prisma.mockInterviewSession.aggregate({
      where: { status: "completed" },
      _count: { _all: true },
      _avg: { totalScore: true },
    }),
    prisma.interview.groupBy({
      by: ["status"],
      where: { kind: "real" },
      _count: { _all: true },
    }),
    prisma.interview.groupBy({
      by: ["round"],
      where: { kind: "real" },
      _count: { _all: true },
    }),
  ]);

  return {
    recent: recent.map((interview) => ({
      id: interview.id,
      mockSessionId: interview.mockSession?.id ?? null,
      kind: interview.kind === "mock" ? ("mock" as const) : ("real" as const),
      companyName: interview.companyName,
      jobTitle: interview.jobTitle,
      // 真实面试现在也可能是待面试，不能再一律当成已完成。
      status: normalizeInterviewStatus(interview.status),
      round: normalizeInterviewRound(interview.round),
      occurredAt:
        interview.interviewedAt ?? interview.scheduledAt ?? interview.updatedAt,
      questionCount: interview._count.questions,
      score: interview.mockSession?.totalScore ?? null,
    })),
    completedMockCount: mockSummary._count._all,
    averageMockScore:
      mockSummary._avg.totalScore === null
        ? null
        : Math.round(mockSummary._avg.totalScore),
    realInterviewCounts: toRealInterviewStatusCounts(realStatusGroups),
    realInterviewRoundCounts: toRealInterviewRoundCounts(realRoundGroups),
  };
}

type InterviewReviewProject = ResumeProjectOption & {
  type: string;
  organization: string;
  questionCount: number;
};

type InterviewReviewPageData = {
  projects: InterviewReviewProject[];
  unlinkedProjectQuestionCount: number;
  technicalQuestionCount: number;
  generalQuestionCount: number;
  selectedProject: InterviewReviewProject | null;
  questionsPage: QuestionReviewPage;
};

const INTERVIEW_REVIEW_QUESTION_INCLUDE = {
  interview: {
    select: {
      id: true,
      companyName: true,
      jobTitle: true,
      interviewedAt: true,
      scheduledAt: true,
      round: true,
      kind: true,
    },
  },
} satisfies Prisma.InterviewQuestionInclude;

function reviewQuestionBaseWhere(
  source: InterviewReviewFilters["source"],
): Prisma.InterviewQuestionWhereInput {
  return {
    AND: [
      { question: { not: "" } },
      { answer: { not: null } },
      { answer: { not: "" } },
    ],
    interview: {
      status: "completed",
      ...(source === "all" ? {} : { kind: source }),
    },
  };
}

async function getInterviewReviewProjects(
  source: InterviewReviewFilters["source"],
): Promise<{
  projects: InterviewReviewProject[];
  unlinkedProjectQuestionCount: number;
}> {
  const [projects, projectQuestionCounts] = await Promise.all([
    prisma.resumeProject.findMany({
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
        organization: true,
      },
    }),
    prisma.interviewQuestion.groupBy({
      by: ["resumeProjectId"],
      where: {
        ...reviewQuestionBaseWhere(source),
        category: "resume_project",
      },
      _count: { _all: true },
    }),
  ]);
  const countsByProjectId = new Map(
    projectQuestionCounts.map((row) => [
      row.resumeProjectId ?? "unlinked",
      row._count._all,
    ]),
  );

  return {
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      type: project.type,
      organization: project.organization ?? "",
      questionCount: countsByProjectId.get(project.id) ?? 0,
    })),
    unlinkedProjectQuestionCount: countsByProjectId.get("unlinked") ?? 0,
  };
}

async function getInterviewReviewQuestionCounts(
  source: InterviewReviewFilters["source"],
): Promise<{
  technicalQuestionCount: number;
  generalQuestionCount: number;
}> {
  const rows = await prisma.interviewQuestion.groupBy({
    by: ["category"],
    where: {
      ...reviewQuestionBaseWhere(source),
      category: { in: ["technical", "general"] },
    },
    _count: { _all: true },
  });
  const counts = new Map(rows.map((row) => [row.category, row._count._all]));

  return {
    technicalQuestionCount: counts.get("technical") ?? 0,
    generalQuestionCount: counts.get("general") ?? 0,
  };
}

function buildInterviewReviewQuestionWhere(
  filters: InterviewReviewFilters,
): Prisma.InterviewQuestionWhereInput | null {
  if (filters.section === "projects" && filters.projectId) {
    return {
      ...reviewQuestionBaseWhere(filters.source),
      category: "resume_project",
      resumeProjectId:
        filters.projectId === "unlinked" ? null : filters.projectId,
    };
  }

  if (filters.section === "question_bank" && filters.category) {
    return {
      ...reviewQuestionBaseWhere(filters.source),
      category: filters.category,
    };
  }

  return null;
}

async function getInterviewReviewQuestionsPage(
  filters: InterviewReviewFilters,
): Promise<QuestionReviewPage> {
  const where = buildInterviewReviewQuestionWhere(filters);
  if (!where) {
    return paginateQuestionReviewItems([], 1);
  }

  const rows = await prisma.interviewQuestion.findMany({
    where,
    include: INTERVIEW_REVIEW_QUESTION_INCLUDE,
    orderBy: [
      { interview: { interviewedAt: "desc" } },
      { interview: { scheduledAt: "desc" } },
      { sortOrder: "asc" },
    ],
  });

  return paginateQuestionReviewItems(
    groupQuestionReviewItems(rows),
    filters.page,
  );
}

export async function getInterviewReviewPageData(
  filters: InterviewReviewFilters,
): Promise<InterviewReviewPageData> {
  const [{ projects, unlinkedProjectQuestionCount }, questionCounts] =
    await Promise.all([
      getInterviewReviewProjects(filters.source),
      getInterviewReviewQuestionCounts(filters.source),
    ]);
  const questionsPage = await getInterviewReviewQuestionsPage(filters);
  const selectedProject =
    filters.section === "projects" && filters.projectId
      ? projects.find((project) => project.id === filters.projectId) ?? null
      : null;

  return {
    projects,
    unlinkedProjectQuestionCount,
    ...questionCounts,
    selectedProject,
    questionsPage,
  };
}
