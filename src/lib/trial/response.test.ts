import assert from "node:assert/strict";
import test from "node:test";

import { isTrialRequestError, readTrialResponse } from "./response";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function failure(response: Response) {
  try {
    await readTrialResponse(response, "兜底文案");
  } catch (error) {
    assert.ok(isTrialRequestError(error));
    return error;
  }
  throw new Error("expected readTrialResponse to throw");
}

test("returns parsed JSON on success", async () => {
  const data = await readTrialResponse<{ ok: boolean }>(jsonResponse({ ok: true }), "x");
  assert.deepEqual(data, { ok: true });
});

test("maps application errors to request errors and keeps retryable", async () => {
  const error = await failure(jsonResponse({ error: "岗位描述不能为空", retryable: true }, 400));
  assert.equal(error.kind, "request");
  assert.equal(error.message, "岗位描述不能为空");
  assert.equal(error.retryable, true);

  const missing = await failure(jsonResponse({ error: "请先连接你自己的模型服务。" }, 401));
  assert.equal(missing.kind, "not_configured");

  const silent = await failure(jsonResponse({}, 502));
  assert.equal(silent.message, "兜底文案");
});

test("turns a platform timeout page into an actionable timeout error", async () => {
  const error = await failure(
    new Response("An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT", {
      status: 504,
      headers: { "content-type": "text/plain" },
    }),
  );
  assert.equal(error.kind, "timeout");
  assert.equal(error.retryable, true);
  assert.match(error.message, /超时/);
});

test("classifies other non-JSON responses by status and error code", async () => {
  const tooLarge = await failure(
    new Response("FUNCTION_PAYLOAD_TOO_LARGE", { status: 413, headers: { "content-type": "text/plain" } }),
  );
  assert.equal(tooLarge.kind, "payload_too_large");

  const crashed = await failure(
    new Response("<html>An error occurred with your deployment FUNCTION_INVOCATION_FAILED</html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    }),
  );
  assert.equal(crashed.kind, "platform");
  assert.match(crashed.message, /稍后重试/);
});
