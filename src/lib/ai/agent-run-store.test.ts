import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { createTestDatabase } from "@/lib/test-support/prisma-test-db";

/**
 * 运行记录落库与按 runId 串链路。用真库：字段映射（usage 两种形状、
 * 可选列置空、JSON 序列化）正是假 prisma 测不出来的部分。
 */

const database = createTestDatabase();
process.env.DATABASE_URL = database.url;

let store: typeof import("./agent-run-store");
let prisma: typeof import("@/lib/db").prisma;

before(async () => {
  store = await import("./agent-run-store");
  ({ prisma } = await import("@/lib/db"));
});

after(async () => {
  await prisma.$disconnect();
  database.cleanup();
});

const base = {
  runId: "run-chain",
  provider: "openai",
  model: "gpt-test",
  promptVersion: "v1",
  durationMs: 12,
};

test("persists a model call with payload, output and usage, then a selection", async () => {
  await store.persistAgentRun({
    ...base,
    agent: "job_blueprint",
    event: "model_call",
    status: "success",
    finishReason: "stop",
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } as never,
    payload: { jobTitle: "后端" },
    output: { competencies: [] },
    rawText: "{}",
  });
  await store.persistAgentRun({
    ...base,
    agent: "job_blueprint",
    event: "selection",
    status: "partial",
    durationMs: 30.6,
    metrics: { level: 3, competencyCount: 3 },
  });

  const chain = await store.getAgentRunChain("run-chain");
  assert.equal(chain.length, 2);
  assert.equal(chain[0].event, "model_call");
  assert.equal(chain[0].totalTokens, 120);
  assert.equal(chain[0].payloadJson, JSON.stringify({ jobTitle: "后端" }));
  assert.equal(chain[0].outputJson, JSON.stringify({ competencies: [] }));
  assert.equal(chain[1].event, "selection");
  assert.equal(chain[1].durationMs, 31);
  assert.equal(chain[1].payloadJson, null);
  assert.equal(chain[1].metricsJson, JSON.stringify({ level: 3, competencyCount: 3 }));
});

test("accepts usage counters shaped as objects with a total", async () => {
  await store.persistAgentRun({
    ...base,
    runId: "run-usage",
    agent: "follow_up",
    event: "model_call",
    status: "failed",
    errorKind: "timeout",
    usage: { inputTokens: { total: 7 }, outputTokens: undefined } as never,
  });
  const [run] = await store.getAgentRunChain("run-usage");
  assert.equal(run.inputTokens, 7);
  assert.equal(run.outputTokens, null);
  assert.equal(run.errorKind, "timeout");
});

test("tagged writes are flushable and separable from real usage", async () => {
  store.setAgentRunTag("eval-test");
  try {
    // 不 await 单次写入，模拟 logAgentRun 的 fire-and-forget；flush 必须等到它落库。
    void store.persistAgentRun({
      ...base,
      runId: "run-tagged",
      agent: "questions_initial",
      event: "selection",
      status: "success",
    });
  } finally {
    store.setAgentRunTag(null);
  }
  await store.flushAgentRunPersistence();
  const [run] = await store.getAgentRunChain("run-tagged");
  assert.equal(run.tag, "eval-test");
  const tagged = await store.listRecentAgentRuns({ tag: "eval-test" });
  assert.deepEqual(tagged.map((item) => item.runId), ["run-tagged"]);
  const real = await store.listRecentAgentRuns({ tag: null });
  assert.ok(real.every((item) => item.runId !== "run-tagged"));
});

test("recent listing filters by agent and status", async () => {
  const failed = await store.listRecentAgentRuns({ status: "failed" });
  assert.deepEqual(
    failed.map((run) => run.agent),
    ["follow_up"],
  );
  const blueprint = await store.listRecentAgentRuns({ agent: "job_blueprint", limit: 1 });
  assert.equal(blueprint.length, 1);
});
