import type { MockInterviewContext } from "@/lib/mock-interviews/context";
import type {
  MockInterviewJobBlueprint,
  MockInterviewQuestionPlan,
  MockInterviewReport,
} from "@/lib/mock-interviews/types";

/**
 * 体验版模拟面试的会话文档。
 *
 * 与本地完整版的根本区别是**状态归属**：本地版把状态写进 SQLite（要长期保存、
 * 要跨面试聚合成能力画像），体验版把状态放在访客浏览器里，服务端只做无状态计算。
 * 所以这里定义的是一个可序列化的纯数据文档，不依赖任何存储实现。
 *
 * 这个模块只放**纯函数**：状态迁移、下一步判定、上下文构造。AI 调用在 API 路由，
 * 存储在浏览器，三者互不知道对方的实现——将来体验版要加功能（比如把复盘也搬上来），
 * 只需在这里扩展文档结构和迁移函数。
 *
 * `version` 用于将来结构变更时迁移旧会话；读取时版本不匹配一律丢弃重来，
 * 因为体验数据本就是一次性的，不值得为它写迁移代码。
 */

export const TRIAL_INTERVIEW_VERSION = 1;

/** 体验版固定 3 题速览：控制访客 Key 的花费，也降低半途弃坑率。 */
export const TRIAL_QUESTION_COUNT = 3;

export type TrialResumeInput = {
  /** 简历全文，出题的主要素材。 */
  text: string;
  projects: {
    id: string;
    name: string;
    type: string;
    organization: string;
    description: string;
  }[];
};

export type TrialJobInput = {
  companyName: string;
  jobTitle: string;
  jobDescription: string;
};

export type TrialQuestion = {
  question: string;
  category: string;
  /** 出题时预生成，保证同一道题对所有回答用同一把尺子。 */
  rubric: { name: string; description: string; weight: number }[];
  expectedSignals: string[];
  jobCompetencyId: string;
  /** 追问所属的主题目下标；主题目为 null。 */
  parentIndex: number | null;
};

export type TrialEvaluation = {
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  dimensions: { name: string; score: number; evidence: string }[];
};

export type TrialInterviewStatus =
  | "in_progress"
  | "ready_to_evaluate"
  | "completed";

export type TrialInterview = {
  version: typeof TRIAL_INTERVIEW_VERSION;
  createdAt: string;
  job: TrialJobInput;
  resume: TrialResumeInput;
  blueprint: MockInterviewJobBlueprint;
  questions: TrialQuestion[];
  /** 与 questions 同下标；null 表示还没作答，"" 表示跳过。 */
  answers: (string | null)[];
  evaluations: (TrialEvaluation | null)[];
  currentIndex: number;
  status: TrialInterviewStatus;
  report: MockInterviewReport | null;
};

/**
 * 出题只需要简历和 JD——体验版没有历史面试，也没有能力画像。
 * 上下文形状与本地版一致，所以出题 agent 原样复用。
 */
export function buildTrialContext(input: {
  job: TrialJobInput;
  resume: TrialResumeInput;
}): MockInterviewContext {
  return {
    jobDescription: input.job.jobDescription,
    resume: { id: "trial-resume", name: "体验简历", text: input.resume.text },
    projects: input.resume.projects,
    history: [],
    profile: { revision: 0, insights: [] },
  };
}

export function createTrialInterview(input: {
  job: TrialJobInput;
  resume: TrialResumeInput;
  blueprint: MockInterviewJobBlueprint;
  plan: MockInterviewQuestionPlan;
}): TrialInterview {
  const questions: TrialQuestion[] = input.plan.questions.map((question) => ({
    question: question.question.trim(),
    category: question.category,
    rubric: question.rubric,
    expectedSignals: question.expectedSignals,
    jobCompetencyId: question.jobCompetencyId,
    parentIndex: null,
  }));

  return {
    version: TRIAL_INTERVIEW_VERSION,
    createdAt: new Date().toISOString(),
    job: input.job,
    resume: input.resume,
    blueprint: input.blueprint,
    questions,
    answers: questions.map(() => null),
    evaluations: questions.map(() => null),
    currentIndex: 0,
    status: "in_progress",
    report: null,
  };
}

function nextStatus(interview: TrialInterview, nextIndex: number): TrialInterviewStatus {
  return nextIndex >= interview.questions.length ? "ready_to_evaluate" : "in_progress";
}

/**
 * 记录一次作答并推进题目指针。跳过用空字符串表示——它和"还没答"（null）
 * 是两件事，交卷时前者不参与评分、后者会拦住交卷。
 */
export function recordTrialAnswer(
  interview: TrialInterview,
  index: number,
  answer: string | null,
): TrialInterview {
  if (index !== interview.currentIndex || interview.status !== "in_progress") {
    return interview;
  }

  const answers = [...interview.answers];
  answers[index] = answer ?? "";
  const currentIndex = index + 1;

  return {
    ...interview,
    answers,
    currentIndex,
    status: nextStatus(interview, currentIndex),
  };
}

/** 把追问插到刚回答的题目之后，后续题目整体后移。 */
export function insertTrialFollowUp(
  interview: TrialInterview,
  parentIndex: number,
  followUp: { question: string; expectedSignals: string[] },
): TrialInterview {
  const parent = interview.questions[parentIndex];
  if (!parent) return interview;

  const at = parentIndex + 1;
  const question: TrialQuestion = {
    question: followUp.question,
    category: parent.category,
    rubric: parent.rubric,
    expectedSignals:
      followUp.expectedSignals.length > 0
        ? followUp.expectedSignals
        : parent.expectedSignals,
    jobCompetencyId: parent.jobCompetencyId,
    parentIndex,
  };

  const insert = <T,>(list: T[], value: T) => [
    ...list.slice(0, at),
    value,
    ...list.slice(at),
  ];

  return {
    ...interview,
    questions: insert(interview.questions, question),
    answers: insert(interview.answers, null),
    evaluations: insert(interview.evaluations, null),
    // 追问插在当前指针位置，指针不动即可指向它。
    status: "in_progress",
  };
}

export function recordTrialEvaluation(
  interview: TrialInterview,
  index: number,
  evaluation: TrialEvaluation,
): TrialInterview {
  const evaluations = [...interview.evaluations];
  evaluations[index] = evaluation;
  return { ...interview, evaluations };
}

export function completeTrialInterview(
  interview: TrialInterview,
  report: MockInterviewReport,
): TrialInterview {
  return { ...interview, status: "completed", report };
}

/** 已作答（未跳过）且还没评分的题目下标，供前端驱动逐题评分。 */
export function pendingEvaluationIndexes(interview: TrialInterview): number[] {
  return interview.questions.flatMap((_, index) => {
    const answered = interview.answers[index]?.trim();
    return answered && !interview.evaluations[index] ? [index] : [];
  });
}

/** 主题目数量。追问不计入配额，与本地版的追问预算口径一致。 */
export function mainQuestionCount(interview: TrialInterview): number {
  return interview.questions.filter((item) => item.parentIndex === null).length;
}

export function followUpCount(interview: TrialInterview): number {
  return interview.questions.filter((item) => item.parentIndex !== null).length;
}

export function isTrialInterview(value: unknown): value is TrialInterview {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrialInterview>;
  return (
    candidate.version === TRIAL_INTERVIEW_VERSION &&
    Array.isArray(candidate.questions) &&
    Array.isArray(candidate.answers) &&
    Array.isArray(candidate.evaluations)
  );
}
