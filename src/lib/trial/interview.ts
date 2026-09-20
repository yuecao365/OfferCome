import type { ConversationMessage, TurnPayload } from "@/lib/interview/views";
import type { InterviewBrief, InterviewPace } from "@/lib/mock-interviews/brief/brief";
import type { AnswerExemplar, MockInterviewQuestionEvaluation } from "@/lib/mock-interviews/question-evaluation";
import type { MockInterviewReport } from "@/lib/mock-interviews/report";
import type { MockInterviewJobBlueprint } from "@/lib/mock-interviews/types";

/**
 * 体验版模拟面试的会话文档（v8）：与本地版 MockInterviewSession + 消息投影 + 兼容题目同形，
 * 只是整份放在访客浏览器里，服务端无状态计算。
 *
 * 这个模块只放**纯函数**：文档的创建与状态迁移。模型调用在 API 路由、存储在浏览器，
 * 三者互不知道对方的实现。`version` 不匹配的旧文档一律丢弃重来（体验数据一次性）。
 */

export const TRIAL_INTERVIEW_VERSION = 8;

export type TrialResumeInput = {
  /** 简历全文，备课的主要素材。 */
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

/** 评分全量 + 单段总分 + 示范；与本地版 InterviewQuestionEvaluation 的已完成行同形。 */
export type TrialEvaluation = MockInterviewQuestionEvaluation & {
  score: number;
  exemplar: AnswerExemplar | null;
};

export type TrialEvaluationStatus = "pending" | "running" | "completed" | "failed";

/** 切段（纯代码）切出的一段（本地版的 InterviewQuestion + Evaluation 行）。 */
export type TrialSegment = {
  id: string;
  question: string;
  answer: string | null;
  category: string;
  sourceKind: string;
  skipped: boolean;
  rubric: { name: string; description: string; weight: number }[];
  expectedSignals: string[];
  metadata: Record<string, unknown>;
  evaluationStatus: TrialEvaluationStatus;
  evaluation: TrialEvaluation | null;
};

export type TrialInterviewStatus = "generating" | "generation_failed" | "in_progress" | "ready_to_evaluate" | "evaluating" | "completed";

export type TrialInterview = {
  version: typeof TRIAL_INTERVIEW_VERSION;
  /** 会话 id，同时用作 /interviews/mock/[id] 的路由参数。 */
  id: string;
  createdAt: string;
  /** 第一回合落下的时间；房间顶栏据此显示已用时。 */
  startedAt: string | null;
  completedAt: string | null;
  job: TrialJobInput;
  resume: TrialResumeInput;
  pace: InterviewPace;
  status: TrialInterviewStatus;
  generationPhase: "job_blueprint" | "brief" | null;
  generationError: string | null;
  blueprint: MockInterviewJobBlueprint | null;
  brief: InterviewBrief | null;
  /** 面试官的证据账：每回合一行，挂在材料上（与本地版的 ledger_written 事件同义）。 */
  ledger: { materialId: string; text: string }[];
  messages: ConversationMessage[];
  questions: TrialSegment[];
  report: MockInterviewReport | null;
};

export function createTrialInterview(input: { job: TrialJobInput; resume: TrialResumeInput; pace: InterviewPace }): TrialInterview {
  return {
    version: TRIAL_INTERVIEW_VERSION,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    job: input.job,
    resume: input.resume,
    pace: input.pace,
    status: "generating",
    generationPhase: "job_blueprint",
    generationError: null,
    blueprint: null,
    brief: null,
    ledger: [],
    messages: [],
    questions: [],
    report: null,
  };
}

/* ------------------------------ 备课 ------------------------------ */

export function withBlueprint(interview: TrialInterview, blueprint: MockInterviewJobBlueprint): TrialInterview {
  return { ...interview, blueprint, status: "generating", generationPhase: "brief", generationError: null };
}

/** 简报落下即开房，与本地版 persistBrief 同语义。 */
export function withBrief(interview: TrialInterview, brief: InterviewBrief): TrialInterview {
  return { ...interview, brief, status: "in_progress", generationPhase: null, generationError: null };
}

export function withGenerationError(interview: TrialInterview, message: string): TrialInterview {
  return { ...interview, status: "generation_failed", generationError: message };
}

/** 重试从失败的那一步开始：蓝图已有就直接备课。 */
export function retryGeneration(interview: TrialInterview): TrialInterview {
  return { ...interview, status: "generating", generationPhase: interview.blueprint ? "brief" : "job_blueprint", generationError: null };
}

/* ------------------------------ 面试中 ------------------------------ */

/** 把一个回合的结果应用到文档：新消息、证据账、阶段，与本地版 persistTurn 同语义。 */
export function applyTurnPayload(interview: TrialInterview, payload: TurnPayload): TrialInterview {
  return {
    ...interview,
    startedAt: interview.startedAt ?? new Date().toISOString(),
    messages: [...interview.messages, ...payload.newMessages],
    ledger: payload.ledger ? [...interview.ledger, payload.ledger] : interview.ledger,
    status: payload.phase === "ended" ? "ready_to_evaluate" : interview.status,
  };
}

/* ------------------------------ 评分与交卷 ------------------------------ */

export function setSegmentEvaluation(interview: TrialInterview, segmentId: string, update: { evaluationStatus: TrialEvaluationStatus; evaluation?: TrialEvaluation | null }): TrialInterview {
  return {
    ...interview,
    questions: interview.questions.map((segment) => (segment.id === segmentId ? { ...segment, evaluationStatus: update.evaluationStatus, evaluation: update.evaluation ?? segment.evaluation } : segment)),
  };
}

/** 已作答、还没有评分结果的段落（pending 与 failed），交卷前要补齐。 */
export function segmentsToEvaluate(interview: TrialInterview): TrialSegment[] {
  return interview.questions.filter((segment) => !segment.skipped && (segment.evaluationStatus === "pending" || segment.evaluationStatus === "failed"));
}

export function withStatus(interview: TrialInterview, status: TrialInterviewStatus): TrialInterview {
  return { ...interview, status };
}

export function completeTrialInterview(interview: TrialInterview, report: MockInterviewReport): TrialInterview {
  return { ...interview, status: "completed", report, completedAt: new Date().toISOString() };
}

export function isTrialInterview(value: unknown): value is TrialInterview {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrialInterview>;
  return candidate.version === TRIAL_INTERVIEW_VERSION && typeof candidate.id === "string" && Array.isArray(candidate.messages) && Array.isArray(candidate.questions);
}
