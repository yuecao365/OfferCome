import assert from "node:assert/strict";
import test from "node:test";

import { auxConfigFromEnv, modelFamily, parseAuxConfig } from "./models";

test("auxConfigFromEnv prefers the full JSON and falls back to a bare DeepSeek key", () => {
  const full = auxConfigFromEnv({ EVAL_AUX_AI_CONFIG: JSON.stringify({ provider: "qwen", model: "qwen-plus", apiKey: "k" }), DEEPSEEK_API_KEY: "sk-x" });
  assert.equal(full?.provider, "qwen");
  const bare = auxConfigFromEnv({ DEEPSEEK_API_KEY: "sk-x" });
  assert.equal(bare?.provider, "deepseek");
  assert.equal(bare?.model, "deepseek-chat");
  assert.equal(bare?.apiKey, "sk-x");
  assert.equal(auxConfigFromEnv({}), null);
});

test("parseAuxConfig rejects malformed JSON and unknown providers", () => {
  assert.throws(() => parseAuxConfig("{not json"), /不是合法 JSON/);
  assert.throws(() => parseAuxConfig(JSON.stringify({ provider: "nope", model: "m", apiKey: "k" })), /无效/);
});

test("modelFamily groups compatible endpoints by host and others by provider", () => {
  const base = { task: "text" as const, model: "m", apiKey: "k", requiresApiKey: true };
  assert.equal(modelFamily({ ...base, provider: "deepseek", baseURL: null }), "deepseek");
  assert.equal(modelFamily({ ...base, provider: "compatible", baseURL: "https://api.example.com/v1" }), "api.example.com");
});
