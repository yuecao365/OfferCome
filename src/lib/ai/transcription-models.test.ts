import assert from "node:assert/strict";
import test from "node:test";

import type { AiTaskConfig } from "./config";
import {
  createByteDanceTranscriptionModel,
  createQwenTranscriptionModel,
} from "./transcription-models";

function taskConfig(
  provider: AiTaskConfig["provider"],
  model: string,
  baseURL: string,
): AiTaskConfig {
  return {
    task: "transcription",
    provider,
    model,
    baseURL,
    apiKey: "test-api-key",
    requiresApiKey: true,
  };
}

test("Qwen transcription sends the model and input_audio payload", async () => {
  let requestURL = "";
  let requestBody: Record<string, unknown> = {};
  const fetchMock: typeof fetch = async (input, init) => {
    requestURL = String(input);
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      model: "qwen3-asr-flash",
      choices: [{ message: { content: "测试转写" } }],
    });
  };
  const model = createQwenTranscriptionModel(
    taskConfig(
      "qwen",
      "qwen3-asr-flash",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    fetchMock,
  );

  const generated = await model.doGenerate({
    audio: new Uint8Array([1, 2, 3]),
    mediaType: "audio/wav",
  });

  assert.equal(
    requestURL,
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  );
  assert.equal(requestBody.model, "qwen3-asr-flash");
  const messages = requestBody.messages as Array<{
    content: Array<{ type: string; input_audio: { data: string } }>;
  }>;
  assert.equal(messages[0].content[0].type, "input_audio");
  assert.match(messages[0].content[0].input_audio.data, /^data:audio\/wav;base64,/);
  assert.equal(generated.text, "测试转写");
});

test("ByteDance flash transcription sends API key and resource headers", async () => {
  let requestURL = "";
  let requestHeaders = new Headers();
  const fetchMock: typeof fetch = async (input, init) => {
    requestURL = String(input);
    requestHeaders = new Headers(init?.headers);
    return Response.json(
      {
        audio_info: { duration: 1_250 },
        result: { text: "火山转写" },
      },
      { headers: { "X-Api-Status-Code": "20000000" } },
    );
  };
  const model = createByteDanceTranscriptionModel(
    taskConfig(
      "bytedance",
      "volc.bigasr.auc_turbo",
      "https://openspeech.bytedance.com/api/v3/auc/bigmodel",
    ),
    fetchMock,
  );

  const generated = await model.doGenerate({
    audio: new Uint8Array([1, 2, 3]),
    mediaType: "audio/mp3",
  });

  assert.equal(
    requestURL,
    "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
  );
  assert.equal(requestHeaders.get("X-Api-Key"), "test-api-key");
  assert.equal(requestHeaders.get("X-Api-Resource-Id"), "volc.bigasr.auc_turbo");
  assert.equal(generated.text, "火山转写");
  assert.equal(generated.durationInSeconds, 1.25);
});
