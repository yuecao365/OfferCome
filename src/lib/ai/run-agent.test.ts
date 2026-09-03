import assert from "node:assert/strict";
import test from "node:test";

import { NoObjectGeneratedError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

import type { AiTaskConfig } from "./config";
import {
  AgentRunError,
  assertAiConfigured,
  isAgentTimeout,
  runAgent,
  type AgentLogRecord,
} from "./run-agent";

const schema = z.object({ answer: z.string() });

const config: AiTaskConfig = {
  task: "text",
  provider: "local",
  model: "test-model",
  baseURL: "http://localhost:1234/v1",
  apiKey: null,
  requiresApiKey: false,
};

function captureLogs(): { records: AgentLogRecord[]; restore: () => void } {
  const original = console.info;
  const records: AgentLogRecord[] = [];
  console.info = (...args: unknown[]) => {
    if (args[0] === "[ai-agent]" && typeof args[1] === "string") {
      records.push(JSON.parse(args[1]) as AgentLogRecord);
    }
  };
  return { records, restore: () => { console.info = original; } };
}

function respondingModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

function failingModel(error: Error) {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw error;
    },
  });
}

type Answer = z.infer<typeof schema>;

async function run(
  model: MockLanguageModelV4,
  overrides: Partial<Parameters<typeof runAgent<Answer>>[0]> = {},
) {
  return runAgent<Answer>({
    agent: "test_agent",
    runId: "run-1",
    config,
    feature: "测试功能",
    promptVersion: "test-v1",
    schema,
    timeoutMs: 5_000,
    system: "system",
    payload: { input: "data" },
    model,
    ...overrides,
  });
}

test("returns structured output and logs a successful model call", async () => {
  const logs = captureLogs();
  try {
    const result = await run(respondingModel(JSON.stringify({ answer: "ok" })));
    assert.deepEqual(result.output, { answer: "ok" });
    assert.equal(result.partial, false);
    assert.equal(result.provider, "local");
    assert.equal(logs.records.length, 1);
    assert.equal(logs.records[0].status, "success");
    assert.equal(logs.records[0].event, "model_call");
    assert.equal(logs.records[0].agent, "test_agent");
    assert.equal(logs.records[0].usage?.totalTokens, 15);
  } finally {
    logs.restore();
  }
});

test("rejects unconfigured providers before calling the model", () => {
  assert.throws(
    () =>
      assertAiConfigured(
        { ...config, requiresApiKey: true, apiKey: null },
        "AI 模拟面试",
      ),
    (error: unknown) =>
      error instanceof AgentRunError &&
      error.kind === "not_configured" &&
      error.message === "AI 模拟面试需要先在设置页配置文本理解模型和 API Key。",
  );
});

test("rejects strict-mode incompatible schemas before calling the model", async () => {
  const logs = captureLogs();
  try {
    await assert.rejects(
      run(failingModel(new Error("model must not be called")), {
        schema: z.object({ answer: z.string(), note: z.string().optional() }),
      }),
      (error: unknown) =>
        error instanceof AgentRunError &&
        error.kind === "incompatible_schema" &&
        error.message.includes("note 不在 required 里"),
    );
    assert.deepEqual(
      logs.records.map((record) => record.errorKind),
      ["incompatible_schema"],
    );
  } finally {
    logs.restore();
  }
});

test("classifies timeouts separately from provider failures", async () => {
  const logs = captureLogs();
  try {
    await assert.rejects(
      run(failingModel(new Error("The operation timed out"))),
      (error: unknown) =>
        error instanceof AgentRunError &&
        error.kind === "timeout" &&
        isAgentTimeout(error),
    );
    await assert.rejects(
      run(failingModel(new Error("503 upstream unavailable"))),
      (error: unknown) =>
        error instanceof AgentRunError && error.kind === "provider_error",
    );
    assert.deepEqual(
      logs.records.map((record) => record.errorKind),
      ["timeout", "provider_error"],
    );
  } finally {
    logs.restore();
  }
});

test("classifies unusable structured output", async () => {
  const logs = captureLogs();
  try {
    await assert.rejects(
      run(respondingModel("not json at all")),
      (error: unknown) =>
        error instanceof AgentRunError &&
        error.kind === "invalid_structured_output",
    );
    assert.equal(logs.records[0].status, "failed");
  } finally {
    logs.restore();
  }
});

test("rescues a partial result from unparsable output", async () => {
  const logs = captureLogs();
  try {
    const result = await run(respondingModel('{"answer": "trunc'), {
      rescue: (rawText) => (rawText ? { answer: "rescued" } : null),
    });
    assert.deepEqual(result.output, { answer: "rescued" });
    assert.equal(result.partial, true);
    assert.equal(logs.records[0].status, "partial");
  } finally {
    logs.restore();
  }
});

test("keeps the raw text on the error so callers can inspect it", async () => {
  const logs = captureLogs();
  try {
    await assert.rejects(
      run(respondingModel("still not json")),
      (error: unknown) =>
        error instanceof AgentRunError &&
        NoObjectGeneratedError.isInstance(error.cause) &&
        error.rawText === "still not json",
    );
  } finally {
    logs.restore();
  }
});
