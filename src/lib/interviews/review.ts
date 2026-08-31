import { normalizeInterviewRound, normalizeQuestionCategory } from "./types";
import type { InterviewQuestionCategory, InterviewRound } from "./types";
import { questionSimilarity } from "@/lib/text/similarity";

export const INTERVIEW_REVIEW_PAGE_SIZE = 8;

export type InterviewReviewSection =
  | "overview"
  | "projects"
  | "question_bank";

export type InterviewReviewQuestionCategory = Extract<
  InterviewQuestionCategory,
  "technical" | "general"
>;

export type QuestionReviewOrigin = "real" | "mock";
export type InterviewReviewSourceFilter = QuestionReviewOrigin | "all";

export const QUESTION_REVIEW_ORIGIN_LABELS: Record<
  QuestionReviewOrigin,
  string
> = {
  real: "真实面试",
  mock: "AI 模拟",
};

export const INTERVIEW_REVIEW_SOURCE_LABELS: Record<
  InterviewReviewSourceFilter,
  string
> = {
  all: "全部来源",
  ...QUESTION_REVIEW_ORIGIN_LABELS,
};

export type InterviewReviewFilters = {
  section: InterviewReviewSection;
  projectId: string | null;
  category: InterviewReviewQuestionCategory | null;
  source: InterviewReviewSourceFilter;
  page: number;
};

/** 复盘左侧索引里的实习/项目，带上当前来源筛选下的问题数。 */
export type InterviewReviewProject = {
  id: string;
  name: string;
  type: string;
  organization: string;
  description: string | null;
  questionCount: number;
};

export type QuestionReviewSource = {
  id: string;
  question: string;
  answer: string | null;
  category: string;
  resumeProjectId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  interview: {
    id: string;
    companyName: string;
    jobTitle: string;
    interviewedAt: Date | null;
    scheduledAt: Date | null;
    round: string | null;
    kind: string;
  };
};

export type QuestionReviewAnswer = {
  id: string;
  answer: string;
  companyName: string;
  jobTitle: string;
  interviewedAt: Date | null;
  round: InterviewRound | null;
  origin: QuestionReviewOrigin;
};

export type QuestionReviewItem = {
  question: string;
  category: InterviewQuestionCategory;
  resumeProjectId: string | null;
  askedCount: number;
  realAskedCount: number;
  mockAskedCount: number;
  lastAskedAt: Date | null;
  answers: QuestionReviewAnswer[];
};

/** 复盘页数据的完整形状：本地版查数据库、体验版读浏览器工作台，返回同一形状。 */
export type InterviewReviewPageData = {
  projects: InterviewReviewProject[];
  unlinkedProjectQuestionCount: number;
  technicalQuestionCount: number;
  generalQuestionCount: number;
  selectedProject: InterviewReviewProject | null;
  questionsPage: QuestionReviewPage;
};

export type QuestionReviewPage = {
  items: QuestionReviewItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function getLatestAnsweredQuestionId(
  item: Pick<QuestionReviewItem, "answers">,
): string | null {
  return (
    item.answers.find(
      (answer) => answer.origin === "real" && answer.answer.trim(),
    )?.id ?? null
  );
}

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function isReviewSection(value: string): value is InterviewReviewSection {
  return value === "projects" || value === "question_bank";
}

function isReviewQuestionCategory(
  value: string,
): value is InterviewReviewQuestionCategory {
  return value === "technical" || value === "general";
}

function isReviewSource(
  value: string,
): value is InterviewReviewSourceFilter {
  return value === "real" || value === "mock" || value === "all";
}

export function parseInterviewReviewFilters(
  params: Record<string, string | string[] | undefined>,
): InterviewReviewFilters {
  const explicitSection = firstParam(params.section);
  const rawProjectId = firstParam(params.projectId).slice(0, 120);
  const rawCategory = firstParam(params.category);
  const category = isReviewQuestionCategory(rawCategory) ? rawCategory : null;
  const rawSource = firstParam(params.source);
  const section = isReviewSection(explicitSection)
    ? explicitSection
    : rawProjectId
      ? "projects"
      : category
        ? "question_bank"
        : "overview";

  return {
    section,
    projectId: section === "projects" ? rawProjectId || null : null,
    category: section === "question_bank" ? category : null,
    source: isReviewSource(rawSource) ? rawSource : "all",
    page: parsePositiveInteger(firstParam(params.page)),
  };
}

export function paginateQuestionReviewItems(
  items: QuestionReviewItem[],
  requestedPage: number,
  pageSize = INTERVIEW_REVIEW_PAGE_SIZE,
): QuestionReviewPage {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}

function normalizeQuestionText(question: string): string {
  return question.trim().replace(/\s+/g, " ");
}

function timeValue(date: Date | null): number {
  return date?.getTime() ?? 0;
}

export function groupQuestionReviewItems(
  rows: QuestionReviewSource[],
): QuestionReviewItem[] {
  const grouped = new Map<string, QuestionReviewItem>();

  for (const row of rows) {
    const question = normalizeQuestionText(row.question);
    if (!question) {
      continue;
    }

    const category = normalizeQuestionCategory(row.category);
    const resumeProjectId =
      category === "resume_project" ? row.resumeProjectId : null;
    const key = `${category}:${resumeProjectId ?? "none"}:${question}`;
    const interviewedAt = row.interview.interviewedAt ?? row.interview.scheduledAt;
    const origin: QuestionReviewOrigin =
      row.interview.kind === "mock" ? "mock" : "real";
    const existing =
      grouped.get(key) ??
      ({
        question,
        category,
        resumeProjectId,
        askedCount: 0,
        realAskedCount: 0,
        mockAskedCount: 0,
        lastAskedAt: null,
        answers: [],
      } satisfies QuestionReviewItem);

    existing.askedCount += 1;
    if (origin === "mock") {
      existing.mockAskedCount += 1;
    } else {
      existing.realAskedCount += 1;
    }
    if (timeValue(interviewedAt) > timeValue(existing.lastAskedAt)) {
      existing.lastAskedAt = interviewedAt;
    }
    existing.answers.push({
      id: row.id,
      answer: row.answer ?? "",
      companyName: row.interview.companyName,
      jobTitle: row.interview.jobTitle,
      interviewedAt,
      round: normalizeInterviewRound(row.interview.round),
      origin,
    });
    grouped.set(key, existing);
  }

  const exactGroups = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      answers: item.answers.sort(
        (left, right) =>
          timeValue(right.interviewedAt) - timeValue(left.interviewedAt),
      ),
    }))
    .sort(
      (left, right) =>
        timeValue(right.lastAskedAt) - timeValue(left.lastAskedAt) ||
        right.askedCount - left.askedCount,
    );

  const merged: QuestionReviewItem[] = [];
  for (const item of exactGroups) {
    const similar = merged.find(
      (candidate) =>
        candidate.category === item.category &&
        candidate.resumeProjectId === item.resumeProjectId &&
        questionSimilarity(candidate.question, item.question) >= 0.72,
    );
    if (!similar) {
      merged.push({ ...item, answers: [...item.answers] });
      continue;
    }
    const itemIsNewer = timeValue(item.lastAskedAt) > timeValue(similar.lastAskedAt);
    similar.question = itemIsNewer ? item.question : similar.question;
    similar.askedCount += item.askedCount;
    similar.realAskedCount += item.realAskedCount;
    similar.mockAskedCount += item.mockAskedCount;
    similar.lastAskedAt = itemIsNewer ? item.lastAskedAt : similar.lastAskedAt;
    similar.answers = [...similar.answers, ...item.answers].sort(
      (left, right) => timeValue(right.interviewedAt) - timeValue(left.interviewedAt),
    );
  }
  return merged;
}

/** 复盘页所有链接的唯一来源，页面和客户端组件共用，避免查询参数拼错。 */
export function reviewHref(options: {
  section?: InterviewReviewSection;
  projectId?: string | null;
  category?: InterviewReviewQuestionCategory | null;
  source?: InterviewReviewSourceFilter;
  page?: number;
}): string {
  const params = new URLSearchParams();
  const section = options.section ?? "overview";

  if (section !== "overview") {
    params.set("section", section);
  }
  if (options.projectId) {
    params.set("projectId", options.projectId);
  }
  if (options.category) {
    params.set("category", options.category);
  }
  if (options.source && options.source !== "all") {
    params.set("source", options.source);
  }
  if (options.page && options.page > 1) {
    params.set("page", String(options.page));
  }

  const query = params.toString();
  return query ? `/interviews/review?${query}` : "/interviews/review";
}

/** 实习优先显示公司名，项目显示项目名。 */
export function projectIndexLabel(project: {
  name: string;
  type: string;
  organization: string | null;
}): string {
  return project.type === "internship" && project.organization
    ? project.organization
    : project.name;
}

const PROJECT_VALUE_PREFIX = "project:";
export const UNLINKED_PROJECT_VALUE = `${PROJECT_VALUE_PREFIX}unlinked`;

export type QuestionClassification = {
  category: InterviewQuestionCategory;
  resumeProjectId: string | null;
};

/** 把「归类」下拉的选项和题目归类互相转换，实习/项目和通用问题库共用一个下拉。 */
export function questionClassificationValue(
  classification: QuestionClassification,
): string {
  if (classification.category !== "resume_project") {
    return classification.category;
  }

  return classification.resumeProjectId
    ? `${PROJECT_VALUE_PREFIX}${classification.resumeProjectId}`
    : UNLINKED_PROJECT_VALUE;
}

export function projectClassificationValue(projectId: string): string {
  return `${PROJECT_VALUE_PREFIX}${projectId}`;
}

export function parseQuestionClassificationValue(
  value: string,
): QuestionClassification {
  if (!value.startsWith(PROJECT_VALUE_PREFIX)) {
    return {
      category: normalizeQuestionCategory(value),
      resumeProjectId: null,
    };
  }

  const projectId = value.slice(PROJECT_VALUE_PREFIX.length);
  return {
    category: "resume_project",
    resumeProjectId: projectId === "unlinked" ? null : projectId,
  };
}
