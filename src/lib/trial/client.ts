import type { MockInterviewJobBlueprint, MockInterviewReport } from "@/lib/mock-interviews/types";

import { TRIAL_AI_HEADER } from "./protocol";
import { readAiToken } from "./browser-store";
import type {
  TrialEvaluation,
  TrialInterview,
  TrialJobInput,
  TrialQuestion,
  TrialResumeInput,
} from "./interview";
import type { TrialResumeParseResult } from "./resume";

/**
 * 体验版接口的浏览器端封装。
 *
 * 所有需要模型的请求都要带上访客的配置串，集中在这里加，
 * 调用方就不必各自记得。服务端是无状态的：请求里带什么就用什么。
 */

class TrialRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TrialRequestError";
    this.status = status;
  }
}

export function isMissingAiConfig(error: unknown): boolean {
  return error instanceof TrialRequestError && error.status === 401;
}

async function postWithAi<T>(path: string, body: unknown): Promise<T> {
  const token = readAiToken();
  if (!token) throw new TrialRequestError("请先连接你自己的模型服务。", 401);

  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", [TRIAL_AI_HEADER]: token },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new TrialRequestError(data.error ?? "请求失败，请重试。", response.status);
  }
  return data;
}

export async function connectAiConfig(input: {
  provider: string;
  model: string;
  baseURL: string | null;
  apiKey: string;
}): Promise<{ token: string; provider: string; model: string }> {
  const response = await fetch("/api/trial/ai-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as {
    token?: string;
    provider?: string;
    model?: string;
    error?: string;
  };
  if (!response.ok || !data.token) {
    throw new Error(data.error ?? "连接失败，请重试。");
  }
  return { token: data.token, provider: data.provider!, model: data.model! };
}

/** 简历解析不强制 Key：带上就走模型抽取，没有就按规则识别。 */
async function parseResume(init: RequestInit): Promise<TrialResumeParseResult> {
  const token = readAiToken();
  const response = await fetch("/api/trial/resume", {
    method: "POST",
    ...init,
    headers: { ...init.headers, ...(token ? { [TRIAL_AI_HEADER]: token } : {}) },
  });
  const data = (await response.json()) as {
    resume?: TrialResumeParseResult;
    error?: string;
  };
  if (!response.ok || !data.resume) {
    throw new Error(data.error ?? "简历解析失败。");
  }
  return data.resume;
}

export function parseResumeFile(file: File): Promise<TrialResumeParseResult> {
  const formData = new FormData();
  formData.append("file", file);
  return parseResume({ body: formData });
}

export function parseResumeForm(input: {
  summary: string;
  experiences: {
    name: string;
    type: string;
    organization: string;
    description: string;
  }[];
}): Promise<TrialResumeParseResult> {
  return parseResume({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function startInterview(input: {
  job: TrialJobInput;
  resume: TrialResumeInput;
  options?: {
    questionCount?: number;
    difficulty?: string;
    round?: string | null;
    followUpsEnabled?: boolean;
  };
}): Promise<TrialInterview> {
  const { interview } = await postWithAi<{ interview: TrialInterview }>(
    "/api/trial/interview",
    input,
  );
  return interview;
}

export async function evaluateAnswer(input: {
  question: TrialQuestion;
  answer: string;
  jobTitle: string;
  jobDescription: string;
}): Promise<TrialEvaluation> {
  const { evaluation } = await postWithAi<{ evaluation: TrialEvaluation }>(
    "/api/trial/evaluate",
    input,
  );
  return evaluation;
}

export async function requestFollowUp(input: {
  question: TrialQuestion;
  answer: string;
  blueprint: MockInterviewJobBlueprint;
  mainQuestionCount: number;
  existingFollowUpCount: number;
}): Promise<{ question: string; expectedSignals: string[] } | null> {
  const { followUp } = await postWithAi<{
    followUp: { question: string; expectedSignals: string[] } | null;
  }>("/api/trial/follow-up", input);
  return followUp;
}

export async function requestReport(input: {
  jobTitle: string;
  answered: { question: string; score: number; feedback: string }[];
  scores: number[];
}): Promise<MockInterviewReport> {
  const { report } = await postWithAi<{ report: MockInterviewReport }>(
    "/api/trial/report",
    input,
  );
  return report;
}

/** 一场面试的问答 → 能力观察（画像流水线第一相）。 */
export async function assessInterview(input: {
  companyName: string;
  jobTitle: string;
  sourceType: string;
  questions: Array<{
    id: string;
    question: string;
    answer: string;
    category: string;
    existingEvaluation?: { score: number | null; feedback: string | null } | null;
  }>;
}): Promise<
  Array<{
    questionId: string;
    dimension: string;
    score: number;
    confidence: number;
    evidenceExcerpt: string;
  }>
> {
  const { observations } = await postWithAi<{
    observations: Array<{
      questionId: string;
      dimension: string;
      score: number;
      confidence: number;
      evidenceExcerpt: string;
    }>;
  }>("/api/trial/assess", input);
  return observations;
}

/** 观察 → 画像洞察（画像流水线第三相；聚合在浏览器本地完成）。 */
export async function synthesizeInsights(input: {
  roleKey: string;
  metrics: unknown;
  observations: { id: string }[];
  lockedInsights: unknown;
}): Promise<
  Array<{
    dimension: string;
    kind: string;
    title: string;
    statement: string;
    evidence: { observationId: string; polarity: "supports" | "contradicts" }[];
  }>
> {
  const { insights } = await postWithAi<{
    insights: Array<{
      dimension: string;
      kind: string;
      title: string;
      statement: string;
      evidence: { observationId: string; polarity: "supports" | "contradicts" }[];
    }>;
  }>("/api/trial/synthesize", input);
  return insights;
}
