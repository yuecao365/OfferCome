import { randomUUID } from "node:crypto";

import {
  APICallError,
  type TranscriptionModelV4,
  type TranscriptionModelV4Result,
} from "@ai-sdk/provider";

import type { AiTaskConfig } from "./config";
import { getAiFetch } from "./proxy-fetch";

type Fetch = typeof globalThis.fetch;

type QwenResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
};

type ByteDanceResponse = {
  audio_info?: { duration?: number };
  result?: {
    text?: string;
    utterances?: Array<{
      text?: string;
      start_time?: number;
      end_time?: number;
    }>;
  };
};

function getFetch(fetchOverride?: Fetch): Fetch {
  return fetchOverride ?? getAiFetch() ?? globalThis.fetch;
}

function audioBase64(audio: Uint8Array | string): string {
  return typeof audio === "string" ? audio : Buffer.from(audio).toString("base64");
}

function audioFormat(mediaType: string): string {
  const normalized = mediaType.split(";", 1)[0].toLowerCase();
  const formats: Record<string, string> = {
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/webm": "webm",
    "audio/x-m4a": "m4a",
    "audio/x-wav": "wav",
  };
  return formats[normalized] ?? normalized.split("/").at(-1) ?? "wav";
}

function headersRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function definedHeaders(
  headers: Record<string, string | undefined> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function parseResponseBody(response: Response): Promise<{
  json: unknown;
  text: string;
}> {
  const text = await response.text();
  try {
    return { json: text ? JSON.parse(text) : {}, text };
  } catch {
    return { json: {}, text };
  }
}

function apiError({
  message,
  url,
  response,
  responseBody,
  requestBodyValues,
}: {
  message: string;
  url: string;
  response: Response;
  responseBody: string;
  requestBodyValues: unknown;
}): APICallError {
  return new APICallError({
    message,
    url,
    requestBodyValues,
    statusCode: response.status,
    responseHeaders: headersRecord(response.headers),
    responseBody,
    isRetryable: response.status === 429 || response.status >= 500,
  });
}

function result({
  text,
  modelId,
  response,
  body,
  segments = [],
  durationInSeconds,
}: {
  text: string;
  modelId: string;
  response: Response;
  body: unknown;
  segments?: TranscriptionModelV4Result["segments"];
  durationInSeconds?: number;
}): TranscriptionModelV4Result {
  return {
    text,
    segments,
    language: undefined,
    durationInSeconds,
    warnings: [],
    response: {
      timestamp: new Date(),
      modelId,
      headers: headersRecord(response.headers),
      body,
    },
  };
}

export function createQwenTranscriptionModel(
  config: AiTaskConfig,
  fetchOverride?: Fetch,
): TranscriptionModelV4 {
  return {
    specificationVersion: "v4",
    provider: "qwen",
    modelId: config.model,
    async doGenerate(options) {
      const url = `${config.baseURL}/chat/completions`;
      const format = audioFormat(options.mediaType);
      const requestBody = {
        model: config.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: `data:${options.mediaType};base64,${audioBase64(options.audio)}`,
                  format,
                },
              },
            ],
          },
        ],
        stream: false,
        asr_options: { enable_itn: true },
      };
      const response = await getFetch(fetchOverride)(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          ...definedHeaders(options.headers),
        },
        body: JSON.stringify(requestBody),
        signal: options.abortSignal,
      });
      const parsed = await parseResponseBody(response);
      if (!response.ok) {
        throw apiError({
          message: "Qwen 语音转写请求失败。",
          url,
          response,
          responseBody: parsed.text,
          requestBodyValues: { model: config.model, mediaType: options.mediaType },
        });
      }

      const body = parsed.json as QwenResponse;
      const transcript = body.choices?.[0]?.message?.content?.trim();
      if (!transcript) {
        throw new Error("Qwen 语音转写未返回文本。");
      }
      return result({
        text: transcript,
        modelId: body.model ?? config.model,
        response,
        body,
      });
    },
  };
}

function byteDanceSegments(
  body: ByteDanceResponse,
): TranscriptionModelV4Result["segments"] {
  return (body.result?.utterances ?? []).flatMap((utterance) => {
    if (
      !utterance.text ||
      typeof utterance.start_time !== "number" ||
      typeof utterance.end_time !== "number"
    ) {
      return [];
    }
    return [{
      text: utterance.text,
      startSecond: utterance.start_time / 1_000,
      endSecond: utterance.end_time / 1_000,
    }];
  });
}

function byteDanceResult(
  body: ByteDanceResponse,
  modelId: string,
  response: Response,
): TranscriptionModelV4Result | null {
  const transcript = body.result?.text?.trim();
  if (!transcript) return null;
  return result({
    text: transcript,
    modelId,
    response,
    body,
    segments: byteDanceSegments(body),
    durationInSeconds:
      typeof body.audio_info?.duration === "number"
        ? body.audio_info.duration / 1_000
        : undefined,
  });
}

function byteDanceHeaders(
  config: AiTaskConfig,
  requestId: string,
  extraHeaders?: Record<string, string | undefined>,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": config.apiKey ?? "",
    "X-Api-Resource-Id": config.model,
    "X-Api-Request-Id": requestId,
    "X-Api-Sequence": "-1",
    ...definedHeaders(extraHeaders),
  };
}

function byteDanceStatus(response: Response): string | null {
  return response.headers.get("X-Api-Status-Code");
}

async function wait(milliseconds: number, abortSignal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortSignal.reason);
      },
      { once: true },
    );
  });
}

export function createByteDanceTranscriptionModel(
  config: AiTaskConfig,
  fetchOverride?: Fetch,
): TranscriptionModelV4 {
  return {
    specificationVersion: "v4",
    provider: "bytedance",
    modelId: config.model,
    async doGenerate(options) {
      const fetch = getFetch(fetchOverride);
      const requestId = randomUUID();
      const requestBody = {
        user: { uid: "career-agent-local" },
        audio: {
          data: audioBase64(options.audio),
          format: audioFormat(options.mediaType),
          codec: "raw",
        },
        request: {
          model_name: "bigmodel",
          model_version: "400",
          enable_itn: true,
          enable_punc: true,
          show_utterances: true,
        },
      };
      const headers = byteDanceHeaders(config, requestId, options.headers);
      const isFlash = config.model === "volc.bigasr.auc_turbo";
      const submitUrl = isFlash
        ? `${config.baseURL}/recognize/flash`
        : `${config.baseURL}/submit`;
      const submitResponse = await fetch(submitUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: options.abortSignal,
      });
      const submitBody = await parseResponseBody(submitResponse);
      const submitStatus = byteDanceStatus(submitResponse);
      if (!submitResponse.ok || (submitStatus && submitStatus !== "20000000")) {
        throw apiError({
          message: submitResponse.headers.get("X-Api-Message") ?? "火山引擎语音转写请求失败。",
          url: submitUrl,
          response: submitResponse,
          responseBody: submitBody.text,
          requestBodyValues: { model: config.model, mediaType: options.mediaType },
        });
      }

      if (isFlash) {
        const generated = byteDanceResult(
          submitBody.json as ByteDanceResponse,
          config.model,
          submitResponse,
        );
        if (!generated) throw new Error("火山引擎语音转写未返回文本。");
        return generated;
      }

      const queryUrl = `${config.baseURL}/query`;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (attempt > 0) await wait(1_000, options.abortSignal);
        const queryResponse = await fetch(queryUrl, {
          method: "POST",
          headers,
          body: "{}",
          signal: options.abortSignal,
        });
        const queryBody = await parseResponseBody(queryResponse);
        const status = byteDanceStatus(queryResponse);
        const generated = byteDanceResult(
          queryBody.json as ByteDanceResponse,
          config.model,
          queryResponse,
        );
        if (queryResponse.ok && status === "20000000" && generated) {
          return generated;
        }
        if (queryResponse.ok && (status === "20000001" || status === "20000002")) {
          continue;
        }
        throw apiError({
          message: queryResponse.headers.get("X-Api-Message") ?? "火山引擎语音转写查询失败。",
          url: queryUrl,
          response: queryResponse,
          responseBody: queryBody.text,
          requestBodyValues: { model: config.model },
        });
      }

      throw new Error("火山引擎语音转写等待超时，请稍后重试。");
    },
  };
}
