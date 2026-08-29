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

async function parseResume(init: RequestInit): Promise<TrialResumeInput> {
  const response = await fetch("/api/trial/resume", { method: "POST", ...init });
  const data = (await response.json()) as {
    resume?: TrialResumeInput;
    error?: string;
  };
  if (!response.ok || !data.resume) {
    throw new Error(data.error ?? "简历解析失败。");
  }
  return data.resume;
}

export function parseResumeFile(file: File): Promise<TrialResumeInput> {
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
}): Promise<TrialResumeInput> {
  return parseResume({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function startInterview(input: {
  job: TrialJobInput;
  resume: TrialResumeInput;
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
