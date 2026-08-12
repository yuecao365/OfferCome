import assert from "node:assert/strict";
import test from "node:test";

import {
  BossBrowserClosedError,
  BossBrowserLoginRequiredError,
  waitForManualBossLogin,
} from "./browser-collector";

test("waits in the same browser until manual Boss login completes", async () => {
  let checks = 0;
  const messages: string[] = [];

  await waitForManualBossLogin({
    timeoutMs: 10_000,
    isClosed: () => false,
    isLoginRequired: async () => {
      checks += 1;
      return checks < 3;
    },
    delay: async () => undefined,
    onMessage: (message) => messages.push(message),
  });

  assert.equal(checks, 3);
  assert.match(messages[0] ?? "", /不要关闭窗口|自动继续/);
});

test("reports a useful error when the user closes the sync browser", async () => {
  await assert.rejects(
    waitForManualBossLogin({
      timeoutMs: 10_000,
      isClosed: () => true,
      isLoginRequired: async () => true,
    }),
    (error: unknown) =>
      error instanceof BossBrowserClosedError &&
      /保持窗口打开/.test(error.message),
  );
});

test("times out manual login without closing the browser", async () => {
  let time = 0;
  await assert.rejects(
    waitForManualBossLogin({
      timeoutMs: 1_000,
      isClosed: () => false,
      isLoginRequired: async () => true,
      delay: async () => {
        time += 500;
      },
      now: () => time,
    }),
    BossBrowserLoginRequiredError,
  );
});
