export const INTERVIEW_STATUSES = ["in_progress", "completed"] as const;
export const INTERVIEW_ROUNDS = [
  "first_interview",
  "second_interview",
  "third_interview",
  "hr_interview",
  "other",
] as const;
export const INTERVIEW_QUESTION_CATEGORIES = [
  "resume_project",
  "technical",
  "general",
] as const;
export const INTERVIEW_SORTS = ["newest", "oldest"] as const;

export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const REAL_INTERVIEW_STATUS: InterviewStatus = "completed";
export const ACTIVE_MOCK_INTERVIEW_STATUS: InterviewStatus = "in_progress";
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];
export type InterviewQuestionCategory =
  (typeof INTERVIEW_QUESTION_CATEGORIES)[number];
export type InterviewSort = (typeof INTERVIEW_SORTS)[number];

export type InterviewQuestionInput = {
  question: string;
  answer: string;
  category: InterviewQuestionCategory;
  resumeProjectId: string | null;
  sortOrder: number;
  confidence?: number;
};

export type InterviewFormValue = {
  companyName: string;
  jobTitle: string;
  interviewedAt: Date;
  round: InterviewRound | null;
  note: string;
  questions: InterviewQuestionInput[];
};

export type InterviewParseResult =
  | { ok: true; value: InterviewFormValue }
  | { ok: false; message: string };

export type InterviewActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type InterviewListItem = {
  id: string;
  kind: "real" | "mock";
  mockSessionId: string | null;
  companyName: string;
  jobTitle: string;
  interviewedAt: Date | null;
  round: InterviewRound | null;
  status: InterviewStatus;
  note: string;
  questionCount: number;
  updatedAt: Date;
  questions: {
    id: string;
    question: string;
    answer: string;
    category: InterviewQuestionCategory;
    resumeProjectId: string | null;
    resumeProjectName: string | null;
    sortOrder: number;
  }[];
};

export type ResumeProjectOption = {
  id: string;
  name: string;
};

export type InterviewStats = {
  total: number;
  offers: number;
  passed: number;
  failed: number;
  preparing: number;
  active: number;
};

export type RealInterviewStatusCounts = {
  total: number;
  scheduled: number;
  completed: number;
  canceled: number;
};

export type RealInterviewRoundCounts = {
  firstInterview: number;
  secondInterview: number;
  thirdInterview: number;
  hrInterview: number;
  other: number;
};

export type InterviewFilters = {
  q: string;
  status: InterviewStatus | "all";
  round: InterviewRound | "all";
  category: InterviewQuestionCategory | "all";
  sort: InterviewSort;
};

export const initialInterviewActionState: InterviewActionState = {
  status: "idle",
  message: "",
};

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  in_progress: "进行中",
  completed: "已完成",
};

export const INTERVIEW_ROUND_LABELS: Record<InterviewRound, string> = {
  first_interview: "一面",
  second_interview: "二面",
  third_interview: "三面",
  hr_interview: "HR 面",
  other: "其他",
};

export const INTERVIEW_QUESTION_CATEGORY_LABELS: Record<
  InterviewQuestionCategory,
  string
> = {
  resume_project: "实习/项目问题",
  technical: "技术八股问题",
  general: "通用问题",
};

function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isInterviewStatus(value: string): value is InterviewStatus {
  return (INTERVIEW_STATUSES as readonly string[]).includes(value);
}

function isInterviewRound(value: string): value is InterviewRound {
  return (INTERVIEW_ROUNDS as readonly string[]).includes(value);
}

function isQuestionCategory(value: string): value is InterviewQuestionCategory {
  return (INTERVIEW_QUESTION_CATEGORIES as readonly string[]).includes(value);
}

function isInterviewSort(value: string): value is InterviewSort {
  return (INTERVIEW_SORTS as readonly string[]).includes(value);
}

function parseDateTime(value: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeInterviewStatus(
  value: string | null | undefined,
): InterviewStatus {
  return value === "completed" ? "completed" : "in_progress";
}

export function normalizeInterviewRound(
  value: string | null | undefined,
): InterviewRound | null {
  return value && isInterviewRound(value) ? value : null;
}

export function normalizeQuestionCategory(
  value: string | null | undefined,
): InterviewQuestionCategory {
  return value && isQuestionCategory(value) ? value : "general";
}

export function statusLabel(status: InterviewStatus): string {
  return INTERVIEW_STATUS_LABELS[status];
}

export function roundLabel(round: InterviewRound | null): string {
  return round ? INTERVIEW_ROUND_LABELS[round] : "未设置";
}

export function questionCategoryLabel(category: InterviewQuestionCategory): string {
  return INTERVIEW_QUESTION_CATEGORY_LABELS[category];
}

export function parseInterviewQuestionsJson(value: string): InterviewQuestionInput[] {
  let rawQuestions: unknown;
  try {
    rawQuestions = JSON.parse(value || "[]");
  } catch {
    return [];
  }

  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  return rawQuestions
    .map((rawQuestion) => {
      if (!rawQuestion || typeof rawQuestion !== "object") {
        return null;
      }

      const record = rawQuestion as Record<string, unknown>;
      const question =
        typeof record.question === "string" ? record.question.trim() : "";
      if (!question) {
        return null;
      }

      return {
        question,
        answer: typeof record.answer === "string" ? record.answer.trim() : "",
        category: normalizeQuestionCategory(
          typeof record.category === "string" ? record.category : null,
        ),
        resumeProjectId:
          typeof record.resumeProjectId === "string" &&
          record.resumeProjectId.trim()
            ? record.resumeProjectId.trim()
            : null,
      };
    })
    .filter(
      (
        question,
      ): question is {
        question: string;
        answer: string;
        category: InterviewQuestionCategory;
        resumeProjectId: string | null;
      } => Boolean(question),
    )
    .slice(0, 100)
    .map((question, index) => ({
      ...question,
      resumeProjectId:
        question.category === "resume_project" ? question.resumeProjectId : null,
      sortOrder: index,
    }));
}

export function parseInterviewFormData(
  formData: FormData,
): InterviewParseResult {
  const companyName = getString(formData, "companyName");
  const jobTitle = getString(formData, "jobTitle");
  const interviewedAt = parseDateTime(
    getString(formData, "interviewedAt") || getString(formData, "scheduledAt"),
  );
  const round = normalizeInterviewRound(getString(formData, "round"));
  const note = getString(formData, "note");
  const questions = parseInterviewQuestionsJson(
    getString(formData, "questionsJson"),
  );

  if (!companyName) {
    return { ok: false, message: "公司名称不能为空。" };
  }
  if (!jobTitle) {
    return { ok: false, message: "工作岗位不能为空。" };
  }
  if (!interviewedAt) {
    return { ok: false, message: "面试时间不能为空。" };
  }

  return {
    ok: true,
    value: {
      companyName,
      jobTitle,
      interviewedAt,
      round,
      note,
      questions,
    },
  };
}

function getQueryValue(
  params: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const value = params[name];
  return typeof value === "string" ? value.trim() : "";
}

export function parseInterviewFilters(
  params: Record<string, string | string[] | undefined>,
): InterviewFilters {
  const status = getQueryValue(params, "status");
  const round = getQueryValue(params, "round");
  const category = getQueryValue(params, "category");
  const sort = getQueryValue(params, "sort");

  return {
    q: getQueryValue(params, "q").slice(0, 100),
    status: isInterviewStatus(status) ? status : "all",
    round: isInterviewRound(round) ? round : "all",
    category: isQuestionCategory(category) ? category : "all",
    sort: isInterviewSort(sort) ? sort : "newest",
  };
}
