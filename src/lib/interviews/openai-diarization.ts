import "server-only";

import { z } from "zod";

import { getAiFetch } from "@/lib/ai/proxy-fetch";
import { getAiTaskConfig } from "@/lib/settings/ai";

import type { AudioTranscriptionInput } from "./transcription";
import type { TranscriptionArtifact } from "./voice-metrics";

const diarizedResponseSchema = z.object({
  text: z.string(),
  duration: z.number().optional(),
  segments: z.array(
    z.object({
      text: z.string(),
      start: z.number(),
      end: z.number(),
      speaker: z.union([z.string(), z.number()]),
    }),
  ),
});

function audioExtension(mediaType: string): string {
  if (mediaType.includes("mpeg")) return "mp3";
  if (mediaType.includes("mp4")) return "m4a";
  if (mediaType.includes("webm")) return "webm";
  if (mediaType.includes("ogg")) return "ogg";
  return "wav";
}

export async function transcribeOpenAiDiarized(
  input: AudioTranscriptionInput,
): Promise<TranscriptionArtifact> {
  const config = await getAiTaskConfig("transcription");
  if (config.provider !== "openai" || !config.apiKey) {
    throw new Error("当前转写服务不支持受控说话人分离。");
  }
  const formData = new FormData();
  const audioBuffer = new ArrayBuffer(input.bytes.byteLength);
  new Uint8Array(audioBuffer).set(input.bytes);
  formData.set("file", new Blob([audioBuffer], { type: input.mediaType }), `interview.${audioExtension(input.mediaType)}`);
  formData.set("model", "gpt-4o-transcribe-diarize");
  formData.set("response_format", "diarized_json");
  formData.set("chunking_strategy", "auto");
  const request = getAiFetch() ?? fetch;
  const response = await request("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`说话人分离转写失败（${response.status}）：${body.slice(0, 500)}`);
  }
  const parsed = diarizedResponseSchema.parse(await response.json());
  const segments = parsed.segments.map((segment) => ({
    text: segment.text,
    start: segment.start,
    end: segment.end,
    speaker: String(segment.speaker),
  }));
  return {
    text: parsed.text.trim(),
    segments,
    durationSeconds: parsed.duration ?? segments.at(-1)?.end ?? null,
    speakers: [...new Set(segments.map((segment) => segment.speaker).filter((speaker): speaker is string => Boolean(speaker)))],
    capabilities: {
      hasTimestamps: true,
      hasSpeakers: true,
      hasVoiceMetrics: false,
    },
  };
}
