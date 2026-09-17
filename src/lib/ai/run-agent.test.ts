import assert from "node:assert/strict";
import test from "node:test";

import { NoObjectGeneratedError } from "ai";
import { tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

import type { LoopToolSet } from "./agent-loop";
import type { AiTaskConfig } from "./config";
import {
  AgentRunError,
  assertAiConfigured,
  isAgentTimeout,
  runAgent,
  setAgentRunSink,
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

test("hands the full record to the sink but keeps payload out of the console", async () => {
  const logs = captureLogs();
  const sunk: AgentLogRecord[] = [];
  setAgentRunSink((record) => {
    sunk.push(record);
  });
  try {
    await run(respondingModel(JSON.stringify({ answer: "ok" })));
    assert.equal(sunk.length, 1);
    assert.deepEqual(sunk[0].payload, { input: "data" });
    assert.deepEqual(sunk[0].output, { answer: "ok" });
    assert.equal(sunk[0].rawText, JSON.stringify({ answer: "ok" }));
    assert.equal("payload" in logs.records[0], false);
    assert.equal("rawText" in logs.records[0], false);
  } finally {
    setAgentRunSink(null);
    logs.restore();
  }
});

test("a failing sink never breaks the agent call", async () => {
  const logs = captureLogs();
  const originalWarn = console.warn;
  const warnings: unknown[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args[0]);
  };
  setAgentRunSink(async () => {
    throw new Error("db down");
  });
  try {
    const result = await run(respondingModel(JSON.stringify({ answer: "ok" })));
    assert.deepEqual(result.output, { answer: "ok" });
    // 落点的 Promise 在下一轮微任务里才拒绝。
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(warnings.length, 1);
  } finally {
    setAgentRunSink(null);
    console.warn = originalWarn;
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
    assert.equal(logs.records.at(-1)?.status, "partial", "修补失败后由调用方 rescue，主记录记 partial");
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

function sequenceModel(texts: string[]): { model: MockLanguageModelV4; prompts: unknown[] } {
  const prompts: unknown[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      prompts.push(prompt);
      const text = texts[Math.min(prompts.length - 1, texts.length - 1)];
      return {
        content: [{ type: "text" as const, text }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
        warnings: [],
      };
    },
  });
  return { model, prompts };
}

test("输出契约（§12.3）：类型写偏先按 schema 收敛，不再调模型；收敛不了就带着校验错误让模型改一次，改好记 partial", async () => {
  const logs = captureLogs();
  try {
    const coerced = sequenceModel([JSON.stringify({ answer: { text: "对象写成了字符串字段" }, extra: 1 })]);
    const first = await run(coerced.model);
    assert.deepEqual(first.output, { answer: '{"text":"对象写成了字符串字段"}' });
    assert.equal(first.partial, true);
    assert.equal(coerced.prompts.length, 1);

    const repaired = sequenceModel([JSON.stringify({ reply: "键名错了" }), JSON.stringify({ answer: "改好了" })]);
    const second = await run(repaired.model);
    assert.deepEqual(second.output, { answer: "改好了" });
    assert.equal(second.partial, true);
    assert.equal(repaired.prompts.length, 2);
    const retryPrompt = JSON.stringify(repaired.prompts[1]);
    assert.match(retryPrompt, /上一次输出不符合要求/);
    assert.match(retryPrompt, /键名错了/);
    assert.deepEqual(logs.records.filter((record) => record.event === "repair").map((record) => record.status), ["success"]);

    const hopeless = sequenceModel([JSON.stringify({ reply: "错" }), JSON.stringify({ reply: "还是错" })]);
    await assert.rejects(run(hopeless.model), (error: unknown) => error instanceof AgentRunError && error.kind === "invalid_structured_output");
    assert.equal(hopeless.prompts.length, 2, "只重试一次");
  } finally {
    logs.restore();
  }
});

const step = (content: ({ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; input: string })[]) => ({
  content,
  finishReason: { unified: (content.some((part) => part.type === "tool-call") ? "tool-calls" : "stop") as "tool-calls" | "stop", raw: "x" },
  usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
  warnings: [],
});

/** 按步返回预设内容，并记下每步的 toolChoice 与消息条数。 */
function loopModel(steps: ReturnType<typeof step>[]) {
  const calls: { toolChoice: unknown; prompt: unknown }[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt, toolChoice }) => {
      calls.push({ toolChoice, prompt });
      return steps[Math.min(calls.length - 1, steps.length - 1)];
    },
  });
  return { model, calls };
}

test("runAgent 跑在循环上（G1）：工具由循环执行、结果回给模型、最后一步出结构化结果；记账有 step / tool_result 行与 steps 指标", async () => {
  const logs = captureLogs();
  try {
    const seen: string[] = [];
    const lookup: LoopToolSet = { lookup: { access: "read", ...tool({ description: "查", inputSchema: z.object({ q: z.string() }), execute: async ({ q }) => { seen.push(q); return `found ${q}`; } }) } };
    const { model, calls } = loopModel([
      step([{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: JSON.stringify({ q: "resume" }) }]),
      step([{ type: "text", text: JSON.stringify({ answer: "with tool" }) }]),
    ]);
    const result = await run(model, { tools: lookup });
    assert.deepEqual(result.output, { answer: "with tool" });
    assert.equal(result.steps, 2);
    assert.deepEqual(seen, ["resume"]);
    assert.deepEqual(result.toolCalls, [{ toolCallId: "t1", toolName: "lookup", input: { q: "resume" } }]);
    assert.equal(calls.length, 2);
    assert.deepEqual(logs.records.map((record) => [record.event, record.status]), [["step", "success"], ["tool_result", "success"], ["step", "success"], ["model_call", "success"]]);
    assert.deepEqual(logs.records.at(-1)?.metrics, { steps: 2, toolCalls: 1 });
  } finally {
    logs.restore();
  }
});

test("runAgent 的预算与挂起：步数到了写 budget_exceeded 再要一步结论；confirm 档没批准抛 interrupted（带事件），喂回事件与决定续跑", async () => {
  const logs = captureLogs();
  try {
    const lookupCall = step([{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: JSON.stringify({ q: "a" }) }]);
    const tools: LoopToolSet = {
      lookup: { access: "read", ...tool({ description: "查", inputSchema: z.object({ q: z.string() }), execute: async ({ q }) => q }) },
      publish: { access: "confirm", ...tool({ description: "发", inputSchema: z.object({ to: z.string() }), execute: async ({ to }) => `sent ${to}` }) },
    };
    const budgeted = loopModel([lookupCall, step([{ type: "text", text: JSON.stringify({ answer: "concluded" }) }])]);
    const result = await run(budgeted.model, { tools, budget: { maxSteps: 1 } });
    assert.deepEqual(result.output, { answer: "concluded" });
    assert.equal(result.steps, 2);
    assert.equal(budgeted.calls[1].toolChoice && (budgeted.calls[1].toolChoice as { type: string }).type, "none");
    assert.equal(logs.records.some((record) => record.event === "budget_exceeded"), true);

    const paused = loopModel([step([{ type: "tool-call", toolCallId: "p1", toolName: "publish", input: JSON.stringify({ to: "user" }) }])]);
    const error = await run(paused.model, { tools }).catch((thrown: unknown) => thrown);
    assert.ok(error instanceof AgentRunError && error.kind === "interrupted");
    assert.deepEqual(error.pending, { toolCallId: "p1", toolName: "publish", input: { to: "user" } });
    assert.equal(error.events.at(-1)?.type, "interrupted");

    const resumed = loopModel([step([{ type: "text", text: JSON.stringify({ answer: "after publish" }) }])]);
    const done = await run(resumed.model, { tools, resume: { events: error.events, decision: { toolCallId: "p1", approved: true } } });
    assert.deepEqual(done.output, { answer: "after publish" });
    assert.equal(done.events.some((event) => event.type === "tool_result" && event.ok && event.output === "sent user"), true);
    assert.equal(resumed.calls.length, 1, "续跑不重跑挂起前的那一步");
  } finally {
    logs.restore();
  }
});
