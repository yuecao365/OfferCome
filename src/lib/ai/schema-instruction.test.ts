import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import type { AiTaskConfig } from "./config";
import { schemaInstruction } from "./run-agent";

const base: Omit<AiTaskConfig, "provider"> = { task: "text", model: "m", baseURL: null, apiKey: "k", requiresApiKey: true };
const schema = z.object({ reply: z.string(), ok: z.boolean() });

test("schemaInstruction is empty for OpenAI and carries the JSON schema for compatible providers", () => {
  assert.equal(schemaInstruction({ ...base, provider: "openai" }, schema), "");
  const text = schemaInstruction({ ...base, provider: "deepseek" }, schema);
  assert.ok(text.includes("JSON Schema"));
  assert.ok(text.includes('"reply"'));
  assert.ok(text.includes('"ok"'));
  assert.ok(text.includes('"required"'));
});
