import assert from "node:assert/strict";
import test from "node:test";

import { runRefreshBatches } from "./background-runner";

test("后台批处理持续运行到画像完成", async () => {
  let calls = 0;
  const result = await runRefreshBatches({
    maxBatches: 5,
    refresh: async () => {
      calls += 1;
      return calls < 3
        ? { status: "processing", completedCount: calls }
        : { status: "success", revision: 2 };
    },
  });

  assert.equal(calls, 3);
  assert.deepEqual(result, { status: "success", revision: 2 });
});

test("后台批处理在预算耗尽后让恢复调度器接管", async () => {
  let calls = 0;
  const result = await runRefreshBatches({
    maxBatches: 2,
    refresh: async () => {
      calls += 1;
      return { status: "processing" };
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(result, { status: "yielded" });
});

test("后台批处理遇到租约占用时不会重复执行", async () => {
  let calls = 0;
  const result = await runRefreshBatches({
    maxBatches: 5,
    refresh: async () => {
      calls += 1;
      return { status: "skipped", reason: "running" };
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "skipped", reason: "running" });
});
