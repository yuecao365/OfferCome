import { z } from "zod";

import { INTERVIEW_QUESTION_CATEGORIES } from "@/lib/interviews/types";

export const MOCK_INTERVIEW_MODES = ["text", "voice"] as const;
export type MockInterviewMode = (typeof MOCK_INTERVIEW_MODES)[number];

export const MOCK_INTERVIEW_MODE_LABELS: Record<MockInterviewMode, string> = {
  text: "文字面试",
  voice: "语音面试",
};

export function isMockInterviewMode(value: string): value is MockInterviewMode {
  return (MOCK_INTERVIEW_MODES as readonly string[]).includes(value);
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
      }),
    )
    .min(2)
    .max(10),
});

export const mockInterviewQuestionDraftSchema = z.object({
  question: z.string().min(1).max(800),
  category: z.enum(INTERVIEW_QUESTION_CATEGORIES),
  difficulty: z.enum(MOCK_INTERVIEW_DIFFICULTIES),
  sourceKind: z.enum([
    "job_description",
    "resume",
    "history",
    "profile",
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

export function createMockInterviewQuestionBatchSchema(questionCount: number) {
  return z.object({
    questions: z
      .array(mockInterviewQuestionDraftSchema)
      .length(questionCount)
      .describe(`必须恰好包含 ${questionCount} 道不重复的问题`),
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

export const mockInterviewEvaluationSchema = z.object({
  questionEvaluations: z.array(
    z.object({
      questionId: z.string(),
      dimensions: z.array(
        z.object({
          name: z.string(),
          score: z.number().min(0).max(100),
          evidence: z.string().max(500),
        }),
      ),
      strengths: z.array(z.string().max(300)).max(5),
      improvements: z.array(z.string().max(300)).max(5),
      feedback: z.string().min(1).max(1_000),
    }),
  ),
  summary: z.string().min(1).max(2_000),
  strengths: z.array(z.string().max(500)).max(6),
  improvements: z.array(z.string().max(500)).max(6),
  actionPlan: z.array(z.string().max(500)).max(8),
});

export type MockInterviewEvaluationOutput = z.infer<
  typeof mockInterviewEvaluationSchema
>;

export type MockInterviewReport = {
  totalScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  actionPlan: string[];
};

export type MockInterviewQuestionTeaching = {
  competencyName: string | null;
  jdEvidence: string | null;
  expectedSignals: string[];
  rationale: string | null;
  sourceKind: string;
  difficulty: string;
};

export type MockInterviewView = {
  id: string;
  interviewId: string;
  companyName: string;
  jobTitle: string;
  status: string;
  interactionMode: MockInterviewMode;
  currentQuestionIndex: number;
  questionCount: number;
  totalScore: number | null;
  report: MockInterviewReport | null;
  questions: {
    id: string;
    question: string;
    answer: string;
    category: string;
    sortOrder: number;
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

export const MOCK_INTERVIEW_PROMPT_VERSION = "mock-interview-v2";
