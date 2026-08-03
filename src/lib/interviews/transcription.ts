import { APICallError, NoTranscriptGeneratedError, transcribe } from "ai";

import { createTranscriptionModel } from "@/lib/ai/providers";
import { getAiTaskConfig } from "@/lib/settings/ai";
import type { TranscriptionArtifact } from "./voice-metrics";

const AUDIO_MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".mpeg": "audio/mpeg",
  ".mpga": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

export type AudioTranscriptionInput = {
  bytes: Uint8Array;
  mediaType: string;
};

export type AudioTranscriber = (
  input: AudioTranscriptionInput,
) => Promise<string>;

export type AudioChunker = (
  input: AudioTranscriptionInput,
  chunkDurationSeconds: number,
) => Promise<AudioTranscriptionInput[]>;

const INITIAL_CHUNK_DURATION_SECONDS = 5 * 60;
const MIN_CHUNK_DURATION_SECONDS = 30;
const MAX_CHUNKING_DEPTH = 4;
const MAX_AUDIO_CHUNKS = 48;

const AUDIO_LIMIT_ERROR_PATTERNS = [
  /instructions\s*\+\s*audio.*too large/i,
  /context[_ ]length[_ ]exceeded/i,
  /maximum context length/i,
  /too many tokens/i,
  /token.*limit/i,
  /request.*too large/i,
  /payload.*too large/i,
  /file.*too large/i,
  /maximum file size/i,
  /audio.*too (?:large|long)/i,
];

async function transcribeWithConfiguredProvider({
  bytes,
  mediaType,
}: AudioTranscriptionInput): Promise<string> {
  const config = await getAiTaskConfig("transcription");
  if (config.requiresApiKey && !config.apiKey) {
    throw new Error(
      "音频转写需要先在设置页完成模型和 API Key 配置。文本粘贴和文本文件导入仍可直接使用。",
    );
  }

  const result = await transcribe({
    model: withTranscriptionMediaType(
      createTranscriptionModel(config),
      mediaType,
    ),
    audio: bytes,
  });

  return result.text.trim();
}

async function transcribeArtifactWithConfiguredProvider({
  bytes,
  mediaType,
}: AudioTranscriptionInput): Promise<TranscriptionArtifact> {
  const config = await getAiTaskConfig("transcription");
  if (config.requiresApiKey && !config.apiKey) {
    throw new Error("音频转写需要先在设置页完成模型和 API Key 配置。");
  }
  const result = await transcribe({
    model: withTranscriptionMediaType(createTranscriptionModel(config), mediaType),
    audio: bytes,
  });
  const segments = result.segments.map((segment) => ({
    text: segment.text,
    start: segment.startSecond,
    end: segment.endSecond,
    speaker: null,
  }));
  const hasTimestamps = segments.length > 0;
  return {
    text: result.text.trim(),
    segments,
    durationSeconds: result.durationInSeconds ?? segments.at(-1)?.end ?? null,
    speakers: [],
    capabilities: {
      hasTimestamps,
      hasSpeakers: false,
      hasVoiceMetrics: hasTimestamps,
    },
  };
}

async function splitWithFfmpeg(
  input: AudioTranscriptionInput,
  chunkDurationSeconds: number,
): Promise<AudioTranscriptionInput[]> {
  const { splitAudioIntoChunks } = await import("./audio-splitter");
  return splitAudioIntoChunks(input, chunkDurationSeconds);
}

function errorDetails(error: unknown): string {
  const details: string[] = [];
  let current: unknown = error;

  for (let depth = 0; current != null && depth < 4; depth += 1) {
    if (current instanceof Error) details.push(current.message);
    if (APICallError.isInstance(current)) {
      if (current.responseBody) details.push(current.responseBody);
      current = current.cause;
      continue;
    }
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }

  return details.join("\n");
}

export function isAudioLimitError(error: unknown): boolean {
  if (APICallError.isInstance(error) && error.statusCode === 413) return true;
  return AUDIO_LIMIT_ERROR_PATTERNS.some((pattern) =>
    pattern.test(errorDetails(error)),
  );
}

async function transcribeWithAdaptiveChunking(
  input: AudioTranscriptionInput,
  transcriber: AudioTranscriber,
  chunker: AudioChunker,
  chunkDurationSeconds: number,
  depth: number,
): Promise<string> {
  try {
    return (await transcriber(input)).trim();
  } catch (error) {
    const hasNoTranscript = NoTranscriptGeneratedError.isInstance(error);
    if (hasNoTranscript && depth > 0) return "";

    const shouldSplit = hasNoTranscript || isAudioLimitError(error);
    if (!shouldSplit || depth >= MAX_CHUNKING_DEPTH) throw error;

    const chunks = await chunker(input, chunkDurationSeconds);
    if (chunks.length > MAX_AUDIO_CHUNKS) {
      throw new Error(
        `录音需要切分为 ${chunks.length} 段，超过单次最多 ${MAX_AUDIO_CHUNKS} 段的限制。`,
        { cause: error },
      );
    }

    const nextDurationSeconds = Math.max(
      MIN_CHUNK_DURATION_SECONDS,
      Math.floor(chunkDurationSeconds / 2),
    );
    const transcripts: string[] = [];
    for (const chunk of chunks) {
      const transcript = await transcribeWithAdaptiveChunking(
        chunk,
        transcriber,
        chunker,
        nextDurationSeconds,
        depth + 1,
      );
      if (transcript) transcripts.push(transcript);
    }
    return transcripts.join("\n");
  }
}

/**
 * Prefer the extension for known formats because browsers may report M4A as
 * audio/x-m4a (or omit the type entirely).
 */
export function resolveAudioMediaType(
  fileName: string,
  declaredMediaType: string,
): string | undefined {
  const extensionStart = fileName.lastIndexOf(".");
  const extension =
    extensionStart >= 0 ? fileName.slice(extensionStart).toLowerCase() : "";
  const mediaTypeFromExtension = AUDIO_MEDIA_TYPES_BY_EXTENSION[extension];
  if (mediaTypeFromExtension) return mediaTypeFromExtension;

  const normalizedDeclaredType = declaredMediaType
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  return normalizedDeclaredType.startsWith("audio/") &&
    normalizedDeclaredType !== "audio/*"
    ? normalizedDeclaredType
    : undefined;
}

/**
 * AI SDK 7 infers a media type from the bytes passed to transcribe(). Its M4A
 * signature does not account for the MP4 box-size prefix, so a valid M4A can
 * be mislabeled as WAV. Keep the provider abstraction and correct only the
 * call option that reaches the configured transcription model.
 */
export function withTranscriptionMediaType(
  model: ReturnType<typeof createTranscriptionModel>,
  mediaType: string,
): ReturnType<typeof createTranscriptionModel> {
  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    doGenerate: (options) => model.doGenerate({ ...options, mediaType }),
    ...(model.doStream
      ? { doStream: (options) => model.doStream!(options) }
      : {}),
  };
}

export async function transcribeAudio(
  input: AudioTranscriptionInput,
  transcriber: AudioTranscriber = transcribeWithConfiguredProvider,
  chunker: AudioChunker = splitWithFfmpeg,
): Promise<string> {
  const transcript = await transcribeWithAdaptiveChunking(
    input,
    transcriber,
    chunker,
    INITIAL_CHUNK_DURATION_SECONDS,
    0,
  );
  if (!transcript) {
    throw new Error("没有从录音中识别到文本，请检查文件内容后重试。");
  }

  return transcript;
}

export async function transcribeAudioArtifact(
  input: AudioTranscriptionInput,
): Promise<TranscriptionArtifact> {
  try {
    const artifact = await transcribeArtifactWithConfiguredProvider(input);
    if (!artifact.text) throw new Error("没有从录音中识别到文本。");
    return artifact;
  } catch (error) {
    if (!isAudioLimitError(error) && !NoTranscriptGeneratedError.isInstance(error)) {
      throw error;
    }
    const text = await transcribeAudio(input);
    return {
      text,
      segments: [],
      durationSeconds: null,
      speakers: [],
      capabilities: {
        hasTimestamps: false,
        hasSpeakers: false,
        hasVoiceMetrics: false,
      },
    };
  }
}
