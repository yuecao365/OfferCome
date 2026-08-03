import assert from "node:assert/strict";
import test from "node:test";

import { NoTranscriptGeneratedError } from "ai";

import {
  isAudioLimitError,
  resolveAudioMediaType,
  transcribeAudio,
  withTranscriptionMediaType,
} from "./transcription";

test("uses an injected transcription provider boundary", async () => {
  const transcript = await transcribeAudio(
    {
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "audio/mp4",
    },
    async ({ bytes, mediaType }) => {
      assert.deepEqual(Array.from(bytes), [1, 2, 3]);
      assert.equal(mediaType, "audio/mp4");
      return " 面试转写文本 ";
    },
  );

  assert.equal(transcript, "面试转写文本");
});

test("rejects an empty transcription result", async () => {
  await assert.rejects(
    () =>
      transcribeAudio(
        { bytes: new Uint8Array([1]), mediaType: "audio/wav" },
        async () => "   ",
      ),
    /没有从录音中识别到文本/,
  );
});

test("splits and retries audio when the provider rejects its token size", async () => {
  const calls: number[] = [];
  const transcript = await transcribeAudio(
    { bytes: new Uint8Array([1, 2, 3, 4]), mediaType: "audio/mpeg" },
    async ({ bytes }) => {
      calls.push(bytes.length);
      if (bytes.length === 4) {
        throw new Error(
          "Total number of tokens in instructions + audio is too large for this model",
        );
      }
      return bytes[0] === 1 ? "第一段" : "第二段";
    },
    async () => [
      { bytes: new Uint8Array([1, 2]), mediaType: "audio/wav" },
      { bytes: new Uint8Array([3, 4]), mediaType: "audio/wav" },
    ],
  );

  assert.deepEqual(calls, [4, 2, 2]);
  assert.equal(transcript, "第一段\n第二段");
});

test("splits a full recording when the provider returns no transcript", async () => {
  const calls: number[] = [];
  const transcript = await transcribeAudio(
    { bytes: new Uint8Array([1, 2, 3, 4]), mediaType: "audio/mpeg" },
    async ({ bytes }) => {
      calls.push(bytes.length);
      if (bytes.length === 4 || bytes[0] === 1) {
        throw new NoTranscriptGeneratedError({ responses: [] });
      }
      return "第二段有效内容";
    },
    async () => [
      { bytes: new Uint8Array([1, 2]), mediaType: "audio/wav" },
      { bytes: new Uint8Array([3, 4]), mediaType: "audio/wav" },
    ],
  );

  assert.deepEqual(calls, [4, 2, 2]);
  assert.equal(transcript, "第二段有效内容");
});

test("reports an empty recording after all split chunks are silent", async () => {
  await assert.rejects(
    () =>
      transcribeAudio(
        { bytes: new Uint8Array([1, 2]), mediaType: "audio/wav" },
        async () => {
          throw new NoTranscriptGeneratedError({ responses: [] });
        },
        async () => [
          { bytes: new Uint8Array([1]), mediaType: "audio/wav" },
          { bytes: new Uint8Array([2]), mediaType: "audio/wav" },
        ],
      ),
    /没有从录音中识别到文本/,
  );
});

test("does not split unrelated provider failures", async () => {
  let chunkerCalled = false;
  await assert.rejects(
    () =>
      transcribeAudio(
        { bytes: new Uint8Array([1]), mediaType: "audio/wav" },
        async () => {
          throw new Error("API key is invalid");
        },
        async () => {
          chunkerCalled = true;
          return [];
        },
      ),
    /API key is invalid/,
  );
  assert.equal(chunkerCalled, false);
});

test("recognizes common audio size limit errors", () => {
  assert.equal(
    isAudioLimitError(
      new Error("maximum context length exceeded by audio input"),
    ),
    true,
  );
  assert.equal(isAudioLimitError(new Error("service unavailable")), false);
});

test("resolves M4A files to the MP4 audio media type", () => {
  assert.equal(resolveAudioMediaType("interview.m4a", ""), "audio/mp4");
  assert.equal(
    resolveAudioMediaType("interview.M4A", "audio/x-m4a"),
    "audio/mp4",
  );
});

test("passes the declared media type to the transcription provider", async () => {
  let receivedMediaType = "";
  const model = {
    specificationVersion: "v4" as const,
    provider: "test",
    modelId: "test-transcription",
    async doGenerate(options: { mediaType: string }) {
      receivedMediaType = options.mediaType;
      return {
        text: "transcript",
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: "test-transcription",
        },
      };
    },
  } as Parameters<typeof withTranscriptionMediaType>[0];

  await withTranscriptionMediaType(model, "audio/mp4").doGenerate({
    audio: new Uint8Array([0, 0, 0, 28, 102, 116, 121, 112]),
    mediaType: "audio/wav",
  });

  assert.equal(receivedMediaType, "audio/mp4");
});
