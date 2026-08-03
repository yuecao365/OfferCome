import "server-only";

import type { getAiTaskConfig } from "@/lib/settings/ai";

export const MOCK_INTERVIEW_GENERATION_TIMEOUT_MS = 60_000;

export function assertMockInterviewAiConfigured(
  config: Awaited<ReturnType<typeof getAiTaskConfig>>,
): void {
  if (config.requiresApiKey && !config.apiKey) {
    throw new Error("AI 模拟面试需要先在设置页配置文本理解模型和 API Key。");
  }
}

export function isAiTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /timeout|timed out/i.test(error.message))
  );
}
