import { z } from "zod";

import type { InterviewStatus } from "@/lib/interviews/types";

import type { InterviewHypothesis, InterviewPace } from "./interviewer/brief";
import type { InterviewMemory } from "./interviewer/memory";
import type { AnswerExemplar, EvaluationStrength, EvaluationWeakness } from "./question-evaluation";
import type { MockInterviewReport } from "./report";

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

const jobCompetencySchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(400),
  priority: z.enum(["core", "secondary"]),
  jdEvidence: z
    .string()
    .min(1)
    .max(240)
    .describe("从 JD 原文逐字截取的短证据"),
  // 严格模式要求每个字段都 required：可空用 nullable，不用 default/optional。
  origin: z.enum(["jd", "inferred"]),
  sourceUrl: z
    .string()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "来源必须是 HTTP(S) 地址")
    .nullable(),
});

/** 发给模型的蓝图 schema。 */
export const mockInterviewJobBlueprintSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(1_000)
    .describe("仅根据 JD 总结岗位实际工作重点，不加入候选人历史"),
  completeness: z.enum(["complete", "partial", "minimal"]),
  missingInformation: z.array(z.string().min(1).max(200)).max(6),
  competencies: z.array(jobCompetencySchema).min(0).max(10),
});

/** 读会话快照用：早期蓝图没有 origin / sourceUrl，解析时补缺省值。 */
export const storedJobBlueprintSchema = mockInterviewJobBlueprintSchema.extend({
  competencies: z
    .array(
      jobCompetencySchema.extend({
        origin: jobCompetencySchema.shape.origin.default("jd"),
        sourceUrl: jobCompetencySchema.shape.sourceUrl.default(null),
      }),
    )
    .min(0)
    .max(10),
});

export type MockInterviewJobBlueprint = z.infer<
  typeof mockInterviewJobBlueprintSchema
>;
/** 报告页"这道题在考察什么"：这段所属领域的来源与风格、期望信号、面试官关线程时的判断。 */
export type MockInterviewQuestionTeaching = {
  areaName: string | null;
  /** jd：JD 明确要求；baseline：技能包补的岗位常见要求。 */
  competencyOrigin: "jd" | "baseline" | null;
  /** baseline 来源时是哪个技能包。 */
  skillPack: string | null;
  /** 领域风格（scenario / fundamentals）；非技术领域为 null。 */
  areaStyle: string | null;
  /** 候选人在这条线程里的作答总时长（秒），只作辅助信号；没有记录为 null。 */
  answerSeconds: number | null;
  expectedSignals: string[];
  /** 面试官关线程时的判断；代码被迫关线程时为 null。 */
  note: string | null;
  /** 领域类型（technical / project / behavioral）。 */
  sourceKind: string;
};


export type MockInterviewConversationMessage = {
  id: string;
  turnIndex: number;
  role: "interviewer" | "candidate";
  kind: string;
  content: string;
  threadId: string | null;
};

/** 对话式面试的房间视图。 */
export type MockInterviewConversation = {
  phase: "opening" | "running" | "ended";
  pace: InterviewPace;
  /** 备课的预计回合，只用于安全上限。 */
  plannedTurns: number;
  /** 第一回合落库的时间；房间顶栏据此显示已用时。 */
  startedAt: string | null;
  areas: {
    id: string;
    name: string;
    kind: string;
    weight: number;
    /** 简报里的目标追问层数与实际追到的层数。 */
    depth: number;
    depthReached: number;
    status: "pending" | "active" | "covered";
  }[];
  /** 备课装箱时丢掉的方向，报告页告诉用户这场没问到。 */
  droppedAreas: string[];
  threads: {
    id: string;
    areaId: string;
    status: "active" | "closed" | "skipped";
    depth: number;
    hinted: boolean;
    /** 面试官关掉这段时的判断；切段后对应的兼容题目。 */
    note: string | null;
    questionId: string | null;
  }[];
  messages: MockInterviewConversationMessage[];
  /** 仅已完成的会话带：面试官的工作记忆与简历假设，报告页展示。 */
  memory: InterviewMemory | null;
  hypotheses: InterviewHypothesis[];
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
  interactionMode: MockInterviewMode;
  currentQuestionIndex: number;
  questionCount: number;
  totalScore: number | null;
  report: MockInterviewReport | null;
  /** 旧的分步会话没有简报，为 null，房间按只读回放处理。 */
  conversation?: MockInterviewConversation | null;
  questions: {
    id: string;
    question: string;
    answer: string;
    category: string;
    sortOrder: number;
    skipped: boolean;
    teaching?: MockInterviewQuestionTeaching;
    evaluation: null | {
      score: number | null;
      dimensions: { name: string; score: number; evidence: string; gap: string | null }[];
      strengths: EvaluationStrength[];
      weaknesses: EvaluationWeakness[];
      advice: string[];
      feedback: string;
      exemplar: AnswerExemplar | null;
    };
  }[];
};

export const MOCK_INTERVIEW_PROMPT_VERSION = "mock-interview-v6-strict-first";

export const MOCK_INTERVIEW_GENERATION_TIMEOUT_MS = 60_000;

export type MockInterviewGenerationErrorContext = {
  competencyCount?: number;
  requiredCount?: number;
  jobTitle?: string;
  questionCount?: number;
};

/** trace 页面的一回合：候选人的话、面试官的话、模型提案与代码裁决、信息量变化、模型开销。 */
export type MockInterviewTraceTurn = {
  turnIndex: number;
  candidate: { kind: string; content: string; composeMs: number | null } | null;
  interviewer: { kind: string; content: string; toolName: string | null }[];
  decision: {
    proposedAction: string | null;
    appliedAction: string | null;
    followUp: string | null;
    replacedReason: string | null;
    anchorHit: boolean | null;
    memoryPatch: unknown;
    evidenceBefore: number;
    evidenceAfter: number;
    skillsLoaded: number;
    effects: string[];
  } | null;
  run: { status: string; durationMs: number; totalTokens: number | null; errorKind: string | null } | null;
};

export type MockInterviewTrace = {
  id: string;
  companyName: string;
  jobTitle: string;
  status: string;
  pace: InterviewPace;
  evidenceTarget: number;
  areas: { id: string; name: string; kind: string; depth: number }[];
  turns: MockInterviewTraceTurn[];
};
