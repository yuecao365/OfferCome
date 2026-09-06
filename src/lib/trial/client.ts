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
import { readTrialResponse, TrialRequestError, isTrialRequestError } from "./response";
import type { TrialResumeParseResult } from "./resume";

export { isTrialRequestError } from "./response";

/**
 * 体验版接口的浏览器端封装。
 *
 * 所有请求都经 request() 发出：需要模型的接口在这里带上访客的配置串，
 * 响应统一交给 readTrialResponse 解读，调用方拿到的要么是数据，
 * 要么是带 kind 的 TrialRequestError。服务端是无状态的：请求里带什么就用什么。
 */

export function isMissingAiConfig(error: unknown): boolean {
  return isTrialRequestError(error) && error.kind === "not_configured";
}

/** required：没有 Key 直接拦下；optional：有就带上，让服务端能用模型。 */
type AiTokenPolicy = "required" | "optional" | "none";

async function request<T>(
  path: string,
  init: { body: BodyInit; json?: boolean; ai?: AiTokenPolicy },
  fallbackMessage: string,
): Promise<T> {
  const policy = init.ai ?? "none";
  const token = policy === "none" ? null : readAiToken();
  if (policy === "required" && !token) {
    throw new TrialRequestError({
      message: "请先连接你自己的模型服务。",
      status: 401,
      kind: "not_configured",
    });
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      ...(init.json === false ? {} : { "Content-Type": "application/json" }),
      ...(token ? { [TRIAL_AI_HEADER]: token } : {}),
    },
    body: init.body,
  });
  return readTrialResponse<T>(response, fallbackMessage);
}

function postWithAi<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { body: JSON.stringify(body), ai: "required" }, "请求失败，请重试。");
}

export async function connectAiConfig(input: {
  provider: string;
  model: string;
  baseURL: string | null;
  apiKey: string;
}): Promise<{ token: string; provider: string; model: string }> {
  const { token, provider, model } = await request<{
    token: string;
    provider: string;
    model: string;
  }>("/api/trial/ai-config", { body: JSON.stringify(input) }, "连接失败，请重试。");
  return { token, provider, model };
}

/** 简历解析不强制 Key：带上就走模型抽取，没有就按规则识别。 */
async function parseResume(init: { body: BodyInit; json?: boolean }): Promise<TrialResumeParseResult> {
  const { resume } = await request<{ resume: TrialResumeParseResult }>(
    "/api/trial/resume",
    { ...init, ai: "optional" },
    "简历解析失败。",
  );
  return resume;
}

export function parseResumeFile(file: File): Promise<TrialResumeParseResult> {
  const formData = new FormData();
  formData.append("file", file);
  // multipart 的 Content-Type 要由浏览器带 boundary 生成，不能手写。
  return parseResume({ body: formData, json: false });
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
  return parseResume({ body: JSON.stringify(input) });
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
