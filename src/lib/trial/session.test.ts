import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import {
  captureTrialContext,
  decodeTrialAiCookie,
  encodeTrialAiCookie,
  getTrialAiTaskConfig,
  getTrialContext,
  isValidTrialSessionId,
  runWithTrialContext,
} from "./session";

before(() => {
  process.env.APP_MODE = "trial";
});

after(() => {
  delete process.env.APP_MODE;
});

const config = {
  task: "text" as const,
  provider: "deepseek" as const,
  model: "deepseek-chat",
  baseURL: "https://api.deepseek.com",
  apiKey: "sk-visitor-key",
  requiresApiKey: true,
};

test("round-trips a visitor AI config through the cookie codec", () => {
  const decoded = decodeTrialAiCookie(encodeTrialAiCookie(config));
  assert.deepEqual(decoded, config);
});

test("rejects tampered or malformed cookies instead of trusting them", () => {
  // cookie 是客户端可伪造的输入，解码必须走完整校验。
  assert.equal(decodeTrialAiCookie("not-base64!!"), null);
  assert.equal(
    decodeTrialAiCookie(Buffer.from("null").toString("base64url")),
    null,
  );
  assert.equal(
    decodeTrialAiCookie(
      Buffer.from(
        JSON.stringify({ provider: "evil", model: "x", apiKey: "k" }),
      ).toString("base64url"),
    ),
    null,
  );
  // 缺 Key 的配置在体验模式下没有意义。
  assert.equal(
    decodeTrialAiCookie(
      Buffer.from(
        JSON.stringify({ provider: "deepseek", model: "deepseek-chat" }),
      ).toString("base64url"),
    ),
    null,
  );
});

test("only accepts session ids shaped like the ones the proxy issues", () => {
  assert.equal(isValidTrialSessionId(crypto.randomUUID()), true);
  assert.equal(isValidTrialSessionId("short"), false);
  assert.equal(isValidTrialSessionId("../../../etc/passwd"), false);
  assert.equal(isValidTrialSessionId("a".repeat(65)), false);
});

test("background tasks see the captured context through AsyncLocalStorage", async () => {
  const context = { sessionId: crypto.randomUUID(), aiConfig: config };

  const seen = await runWithTrialContext(context, () => getTrialContext());
  assert.deepEqual(seen, context);

  // 请求作用域之外、也没有绑定上下文时，解析不到会话。
  assert.equal(await getTrialContext(), null);
  assert.equal(await captureTrialContext(), null);
});

test("serves the visitor's own AI config for the text task only", async () => {
  const context = { sessionId: crypto.randomUUID(), aiConfig: config };

  await runWithTrialContext(context, async () => {
    assert.deepEqual(await getTrialAiTaskConfig("text"), config);
    // 体验版只开放文字作答，语音转写永远视为未配置。
    const transcription = await getTrialAiTaskConfig("transcription");
    assert.equal(transcription.apiKey, null);
  });

  // 没配 Key 时返回无 Key 默认值，交给 assertAiConfigured 统一报错。
  const unconfigured = await runWithTrialContext(
    { sessionId: crypto.randomUUID(), aiConfig: null },
    () => getTrialAiTaskConfig("text"),
  );
  assert.equal(unconfigured.apiKey, null);
});
