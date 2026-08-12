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

export type InterviewReviewFilters = {
  section: InterviewReviewSection;
  projectId: string | null;
  category: InterviewReviewQuestionCategory | null;
  page: number;
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
  };
};

export type QuestionReviewAnswer = {
  id: string;
  answer: string;
  companyName: string;
  jobTitle: string;
  interviewedAt: Date | null;
  round: InterviewRound | null;
};

export type QuestionReviewItem = {
  question: string;
  category: InterviewQuestionCategory;
  resumeProjectId: string | null;
  askedCount: number;
  lastAskedAt: Date | null;
  answers: QuestionReviewAnswer[];
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
  return item.answers.find((answer) => answer.answer.trim())?.id ?? null;
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

export function parseInterviewReviewFilters(
  params: Record<string, string | string[] | undefined>,
): InterviewReviewFilters {
  const explicitSection = firstParam(params.section);
  const rawProjectId = firstParam(params.projectId).slice(0, 120);
  const rawCategory = firstParam(params.category);
  const category = isReviewQuestionCategory(rawCategory) ? rawCategory : null;
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
    const existing =
      grouped.get(key) ??
      ({
        question,
        category,
        resumeProjectId,
        askedCount: 0,
        lastAskedAt: null,
        answers: [],
      } satisfies QuestionReviewItem);

    existing.askedCount += 1;
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
    similar.lastAskedAt = itemIsNewer ? item.lastAskedAt : similar.lastAskedAt;
    similar.answers = [...similar.answers, ...item.answers].sort(
      (left, right) => timeValue(right.interviewedAt) - timeValue(left.interviewedAt),
    );
  }
  return merged;
}
