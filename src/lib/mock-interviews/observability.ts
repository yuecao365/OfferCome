import type { LanguageModelUsage } from "ai";

type GenerationEvent = {
  generationId: string;
  stage: "job_blueprint" | "questions_initial" | "questions_top_up";
  status: "success" | "partial" | "failed";
  provider: string;
  model: string;
  promptVersion: string;
  durationMs: number;
  requestedCount?: number;
  returnedCount?: number;
  acceptedCount?: number;
  rejectedCount?: number;
  finishReason?: string;
  usage?: LanguageModelUsage;
  errorKind?: string;
};

export function logMockInterviewGeneration(event: GenerationEvent): void {
  console.info(
    "[mock-interviews] generation",
    JSON.stringify({
      ...event,
      usage: event.usage
        ? {
            inputTokens: event.usage.inputTokens,
            outputTokens: event.usage.outputTokens,
            totalTokens: event.usage.totalTokens,
          }
        : undefined,
    }),
  );
}
