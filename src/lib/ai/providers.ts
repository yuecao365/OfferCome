import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { TranscriptionModelV4 } from "@ai-sdk/provider";
import { generateText, transcribe, type LanguageModel } from "ai";

import type { AiTaskConfig } from "./config";
import { getAiFetch } from "./proxy-fetch";
import {
  createByteDanceTranscriptionModel,
  createQwenTranscriptionModel,
} from "./transcription-models";

function providerName(config: AiTaskConfig): string {
  return config.provider === "compatible" ? "custom" : config.provider;
}

export function createTextModel(config: AiTaskConfig): LanguageModel {
  const fetch = getAiFetch();
  if (config.provider === "openai") {
    return createOpenAI({ apiKey: config.apiKey ?? undefined, fetch })(config.model);
  }

  const provider = createOpenAICompatible({
    name: providerName(config),
    baseURL: config.baseURL!,
    apiKey: config.apiKey ?? undefined,
    fetch,
  });
  return provider(config.model);
}

export function createTranscriptionModel(
  config: AiTaskConfig,
): TranscriptionModelV4 {
  if (config.provider === "qwen") {
    return createQwenTranscriptionModel(config);
  }
  if (config.provider === "bytedance") {
    return createByteDanceTranscriptionModel(config);
  }

  const fetch = getAiFetch();
  const provider = createOpenAI({
    name: providerName(config),
    apiKey: config.apiKey ?? "local-no-key",
    baseURL: config.baseURL ?? undefined,
    fetch,
  });
  return provider.transcription(config.model);
}

function createSilentWav(): Uint8Array {
  const sampleRate = 8_000;
  const dataSize = sampleRate * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buffer);
}

export async function testAiConnection(config: AiTaskConfig): Promise<void> {
  const abortSignal = AbortSignal.timeout(20_000);
  if (config.task === "transcription") {
    await transcribe({
      model: createTranscriptionModel(config),
      audio: createSilentWav(),
      abortSignal,
    });
    return;
  }

  await generateText({
    model: createTextModel(config),
    prompt: "Reply with OK.",
    maxOutputTokens: 16,
    abortSignal,
  });
}
