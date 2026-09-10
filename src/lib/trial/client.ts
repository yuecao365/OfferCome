import { DefaultChatTransport, type UIMessage } from "ai";

import type { RecentWeakness } from "@/lib/mock-interviews/context";
import type { InterviewBrief, InterviewPace } from "@/lib/mock-interviews/interviewer/brief";
import type { InterviewMemory } from "@/lib/mock-interviews/interviewer/memory";
import type { SegmentRecord } from "@/lib/mock-interviews/interviewer/segments";
import type { MessageState, ThreadState } from "@/lib/mock-interviews/interviewer/state";
import type { OutcomeQuestion, OutcomeThread } from "@/lib/mock-interviews/outcome";
import type { MockInterviewReport } from "@/lib/mock-interviews/report";
import type { MockInterviewJobBlueprint } from "@/lib/mock-interviews/types";

import { readAiToken } from "./browser-store";
import type { TrialEvaluation, TrialJobInput, TrialResumeInput } from "./interview";
import { TRIAL_AI_HEADER } from "./protocol";
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

function requireAiToken(): string {
  const token = readAiToken();
  if (!token) {
    throw new TrialRequestError({ message: "请先连接你自己的模型服务。", status: 401, kind: "not_configured" });
  }
  return token;
}

async function request<T>(
  path: string,
  init: { body: BodyInit; json?: boolean; ai?: AiTokenPolicy },
  fallbackMessage: string,
): Promise<T> {
  const policy = init.ai ?? "none";
  const token = policy === "required" ? requireAiToken() : policy === "optional" ? readAiToken() : null;

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

/** 岗位描述文件 → 文本（无状态解析，与本地版创建接口同一个解析器）。 */
export async function parseJobDescriptionFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("jobDescriptionFile", file);
  const { text } = await request<{ text: string }>("/api/trial/document", { body: formData, json: false }, "岗位描述解析失败。");
  return text;
}

/* ------------------------------ 模拟面试 ------------------------------ */

export async function requestBlueprint(input: { jobTitle: string; jobDescription: string }): Promise<MockInterviewJobBlueprint> {
  const { blueprint } = await postWithAi<{ blueprint: MockInterviewJobBlueprint }>("/api/trial/blueprint", input);
  return blueprint;
}

export async function requestBrief(input: {
  job: TrialJobInput;
  resume: TrialResumeInput;
  blueprint: MockInterviewJobBlueprint;
  pace: InterviewPace;
  round: string | null;
  recentWeaknesses: RecentWeakness[];
}): Promise<{ brief: InterviewBrief; memory: InterviewMemory }> {
  return postWithAi("/api/trial/brief", input);
}

export type TurnRequestState = { brief: InterviewBrief; memory: InterviewMemory; threads: ThreadState[]; messages: MessageState[] };

/**
 * 回合走 AI SDK 的聊天传输（流式）。状态从浏览器文档现取，随每个请求带上；
 * 房间组件发的 body 只有候选人这条消息，这里把它和状态拼成回合接口的请求体。
 */
export function createTrialTurnTransport(input: {
  readState: () => TurnRequestState;
  context: { jobTitle: string; jobDescription: string; resumeText: string };
}): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: "/api/trial/turn",
    prepareSendMessagesRequest: ({ body }) => {
      const message = (body ?? {}) as { kind?: string; content?: string; intent?: string | null; composeMs?: number | null };
      return {
        headers: { [TRIAL_AI_HEADER]: requireAiToken() },
        body: {
          state: input.readState(),
          context: input.context,
          candidate:
            message.kind === "start"
              ? null
              : { content: message.content ?? "", intent: message.intent ?? null, composeMs: message.composeMs ?? null },
        },
      };
    },
  });
}

export async function evaluateSegment(input: {
  segment: SegmentRecord;
  targetDepth: number;
  round: string | null;
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  skillPacks: string[];
}): Promise<TrialEvaluation> {
  const { evaluation } = await postWithAi<{ evaluation: TrialEvaluation }>("/api/trial/evaluate", input);
  return evaluation;
}

export async function requestReport(input: {
  jobTitle: string;
  brief: InterviewBrief;
  memory: InterviewMemory;
  threads: OutcomeThread[];
  questions: OutcomeQuestion[];
}): Promise<MockInterviewReport> {
  const { report } = await postWithAi<{ report: MockInterviewReport }>("/api/trial/complete", input);
  return report;
}

/* ------------------------------ 能力画像（真实面试） ------------------------------ */

/** 一场真实面试的问答 → 能力观察；模拟面试的观察在浏览器里由评分推导，不经这里。 */
export async function assessInterview(input: {
  companyName: string;
  jobTitle: string;
  sourceType: string;
  questions: Array<{
    id: string;
    question: string;
    answer: string;
    category: string;
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
