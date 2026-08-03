import assert from "node:assert/strict";
import test from "node:test";

import {
  getDefaultBaseURL,
  maskApiKey,
  MODEL_OPTIONS,
  TASK_PROVIDERS,
  validateAiTaskConfig,
} from "./config";

test("exposes the requested providers for each AI task", () => {
  assert.deepEqual(TASK_PROVIDERS.text.slice(0, 8), [
    "openai",
    "anthropic",
    "qwen",
    "kimi",
    "deepseek",
    "glm",
    "minimax",
    "bytedance",
  ]);
  assert.deepEqual(TASK_PROVIDERS.transcription.slice(0, 3), [
    "openai",
    "qwen",
    "bytedance",
  ]);
});

test("provides researched presets while allowing providers with smaller catalogs", () => {
  for (const provider of TASK_PROVIDERS.text.slice(0, 8)) {
    const options = MODEL_OPTIONS.text[provider];
    assert.ok(options && options.length > 0);
  }
  assert.equal(MODEL_OPTIONS.text.deepseek?.length, 2);
  assert.equal(MODEL_OPTIONS.transcription.openai?.length, 3);
  assert.equal(MODEL_OPTIONS.transcription.qwen?.length, 3);
  assert.equal(MODEL_OPTIONS.transcription.bytedance?.length, 3);
});

test("resolves built-in provider endpoints", () => {
  assert.equal(
    getDefaultBaseURL("text", "anthropic"),
    "https://api.anthropic.com/v1",
  );
  assert.equal(
    getDefaultBaseURL("transcription", "qwen"),
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  );
});

test("accepts matching OpenAI transcription configuration", () => {
  const result = validateAiTaskConfig(
    {
      task: "transcription",
      provider: "openai",
      model: "gpt-4o-mini-transcribe",
      apiKey: "sk-example-key-with-enough-length",
    },
    null,
    true,
  );

  assert.equal(result.ok, true);
});

test("rejects text-only models for transcription", () => {
  const result = validateAiTaskConfig(
    {
      task: "transcription",
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey: "sk-example-key-with-enough-length",
    },
    null,
    true,
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /不支持语音转文本/);
});

test("rejects transcription models for text understanding", () => {
  const result = validateAiTaskConfig(
    {
      task: "text",
      provider: "openai",
      model: "whisper-1",
      apiKey: "sk-example-key-with-enough-length",
    },
    null,
    true,
  );

  assert.equal(result.ok, false);
});

test("checks OpenAI key shape without requiring a fixed length", () => {
  const result = validateAiTaskConfig(
    {
      task: "text",
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey: "deepseek-example-key",
    },
    null,
    true,
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /sk-/);
});

test("requires a URL for custom and local providers", () => {
  const missingURL = validateAiTaskConfig(
    {
      task: "text",
      provider: "compatible",
      model: "custom-model",
      apiKey: "provider-key",
      requiresApiKey: true,
    },
    null,
    true,
  );
  const local = validateAiTaskConfig(
    {
      task: "text",
      provider: "local",
      model: "llama3.2",
      baseURL: "http://localhost:11434/v1/",
      apiKey: null,
    },
    null,
    true,
  );

  assert.equal(missingURL.ok, false);
  assert.equal(local.ok, true);
  if (local.ok) {
    assert.equal(local.value.apiKey, null);
    assert.equal(local.value.baseURL, "http://localhost:11434/v1");
  }
});

test("masks API keys without exposing the middle", () => {
  assert.equal(maskApiKey("sk-example-secret-abcd"), "sk-••••abcd");
});
