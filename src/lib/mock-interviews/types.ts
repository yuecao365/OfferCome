import { z } from "zod";

import {
  INTERVIEW_QUESTION_CATEGORIES,
  type InterviewStatus,
} from "@/lib/interviews/types";

/** 题目生成完成、房间可以开始作答时，关联的 Interview 记录进入这个状态。 */
export const ACTIVE_MOCK_INTERVIEW_STATUS: InterviewStatus = "in_progress";

export const MOCK_INTERVIEW_MODES = ["text", "voice"] as const;
export type MockInterviewMode = (typeof MOCK_INTERVIEW_MODES)[number];

export const MOCK_INTERVIEW_MODE_LABELS: Record<MockInterviewMode, string> = {
  text: "文字面试",
  voice: "语音面试",
};

export function isMockInterviewMode(value: string): value is MockInterviewMode {
  return (MOCK_INTERVIEW_MODES as readonly string[]).includes(value);
}

export function mockInterviewDeleteConfirmMessage(status: string): string {
  return status === "completed"
    ? "删除后这场模拟面试的报告和评分记录都会消失，确定删除吗？"
    : "这场模拟面试还没有完成，删除后已作答的内容和进度都会一起消失，确定删除吗？";
}

export const MOCK_INTERVIEW_DIFFICULTIES = [
  "foundational",
  "standard",
  "challenging",
] as const;

export const MOCK_INTERVIEW_DIFFICULTY_LABELS = {
  foundational: "基础",
  standard: "标准",
  challenging: "压力面",
} as const;

export const mockInterviewJobBlueprintSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(1_000)
    .describe("仅根据 JD 总结岗位实际工作重点，不加入候选人历史"),
  completeness: z.enum(["complete", "partial", "minimal"]),
  missingInformation: z.array(z.string().min(1).max(200)).max(6),
  competencies: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().min(1).max(100),
        description: z.string().min(1).max(400),
        priority: z.enum(["core", "secondary"]),
        jdEvidence: z
          .string()
          .min(1)
          .max(240)
          .describe("从 JD 原文逐字截取的短证据"),
        origin: z.enum(["jd", "inferred"]).default("jd"),
        sourceUrl: z
          .string()
          .max(500)
          .refine((value) => /^https?:\/\//i.test(value), "来源必须是 HTTP(S) 地址")
          .nullable()
          .default(null),
      }),
    )
    .min(0)
    .max(10),
});

const mockInterviewQuestionDraftSchema = z.object({
  question: z.string().min(1).max(800),
  category: z.enum(INTERVIEW_QUESTION_CATEGORIES),
  difficulty: z.enum(MOCK_INTERVIEW_DIFFICULTIES),
  sourceKind: z.enum([
    "job_description",
    "resume",
    "history",
    "profile",
    "general_role",
  ]),
  jobCompetencyId: z.string().min(1).max(40),
  jdEvidence: z
    .string()
    .min(1)
    .max(240)
    .describe("从输入 JD 原文逐字截取、能直接支持本题的证据"),
  relevanceScore: z.number().min(0.65).max(1),
  resumeProjectId: z.string().nullable(),
  personalizationSourceId: z
    .string()
    .nullable()
    .describe("history 时填历史 questionId，profile 时填 insightId，否则为 null"),
  rationale: z.string().min(1).max(500),
  expectedSignals: z.array(z.string().min(1).max(240)).min(1).max(5),
});

/** 低于这个数就不值得开场了；其余场景宁可少几题也要交付。 */
export const MIN_MOCK_INTERVIEW_QUESTIONS = 3;

export function createMockInterviewQuestionBatchSchema(questionCount: number) {
  // 恰好 N 道对小模型过脆：允许区间，宁可少几题也不要整批作废。
  return z.object({
    questions: z
      .array(mockInterviewQuestionDraftSchema)
      .min(MIN_MOCK_INTERVIEW_QUESTIONS)
      .max(questionCount)
      .describe(`目标 ${questionCount} 道不重复的问题，最少 ${MIN_MOCK_INTERVIEW_QUESTIONS} 道`),
  });
}

export const providerMockInterviewQuestionBatchSchema = z.object({
  questions: z.array(mockInterviewQuestionDraftSchema),
});

export const looseMockInterviewQuestionBatchSchema = z.object({
  questions: z.array(mockInterviewQuestionDraftSchema).max(12),
});

export type MockInterviewJobBlueprint = z.infer<
  typeof mockInterviewJobBlueprintSchema
>;
export type MockInterviewQuestionDraft = z.infer<
  typeof mockInterviewQuestionDraftSchema
>;
export type MockInterviewQuestionPlan = {
  questions: (MockInterviewQuestionDraft & {
    rubric: { name: string; description: string; weight: number }[];
  })[];
};

export type MockInterviewReport = {
  totalScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  actionPlan: string[];
};

export type MockInterviewQuestionTeaching = {
  competencyName: string | null;
  competencyOrigin: "jd" | "inferred" | null;
  sourceUrl: string | null;
  jdEvidence: string | null;
  expectedSignals: string[];
  rationale: string | null;
  sourceKind: string;
  difficulty: string;
};

export type MockInterviewPersonalizationUsed = {
  profileInsights: { id: string; title: string; kind: string }[];
  historyQuestions: {
    id: string;
    question: string;
    companyName: string;
  }[];
};

export type MockInterviewView = {
  id: string;
  interviewId: string;
  companyName: string;
  jobTitle: string;
  status: string;
  generationPhase: string | null;
  generationErrorCode: string | null;
  generationError: string | null;
  generationErrorContext?: MockInterviewGenerationErrorContext | null;
  jobDescriptionReview?: {
    completeness: "complete" | "partial" | "minimal";
    missingInformation: string[];
    canSupplement: boolean;
  } | null;
  interactionMode: MockInterviewMode;
  currentQuestionIndex: number;
  questionCount: number;
  totalScore: number | null;
  report: MockInterviewReport | null;
  personalizationUsed?: MockInterviewPersonalizationUsed;
  profileContributionCount?: number | null;
  questions: {
    id: string;
    question: string;
    answer: string;
    category: string;
    sortOrder: number;
    skipped: boolean;
    isFollowUp: boolean;
    parentQuestionId: string | null;
    teaching?: MockInterviewQuestionTeaching;
    evaluation: null | {
      score: number | null;
      dimensions: { name: string; score: number; evidence: string }[];
      strengths: string[];
      improvements: string[];
      feedback: string;
    };
  }[];
};

export const MOCK_INTERVIEW_PROMPT_VERSION = "mock-interview-v5-skills";

export const MOCK_INTERVIEW_GENERATION_TIMEOUT_MS = 60_000;

export type MockInterviewGenerationErrorContext = {
  competencyCount?: number;
  requiredCount?: number;
  jobTitle?: string;
  questionCount?: number;
};
