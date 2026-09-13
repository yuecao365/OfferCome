import assert from "node:assert/strict";
import test from "node:test";

import { APICallError, RetryError } from "ai";

import { AgentRunError, classifyError, describeAgentError, isFatalAgentError } from "./run-agent";

/** 额度 / 密钥类错误要被单独归类并给出去哪修的提示；其余只说可以重试。 */

function apiError(statusCode: number, body: string) {
  return new APICallError({ message: "provider", url: "https://api.example", requestBodyValues: {}, statusCode, responseBody: body });
}

test("429 insufficient_quota、401、403 归为 unavailable，普通 429 / 5xx 仍是 provider_error", () => {
  const quota = apiError(429, JSON.stringify({ error: { code: "insufficient_quota", message: "You have no credits remaining." } }));
  assert.equal(classifyError(quota), "unavailable");
  assert.equal(classifyError(apiError(401, "")), "unavailable");
  assert.equal(classifyError(apiError(403, "")), "unavailable");
  assert.equal(classifyError(apiError(429, JSON.stringify({ error: { code: "rate_limit_exceeded", message: "slow down" } }))), "provider_error");
  assert.equal(classifyError(apiError(500, "")), "provider_error");
  // SDK 对 429 会自动重试，最后抛出的是 RetryError 包着最后一次的 APICallError。
  const retried = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [quota, quota, quota] });
  assert.equal(classifyError(retried), "unavailable");
  assert.match(describeAgentError(retried), /no credits remaining/);
  assert.match(describeAgentError(quota), /模型服务不可用：You have no credits remaining/);
  assert.match(describeAgentError(apiError(500, "")), /可以重试/);
});

test("连接被拒 / DNS 失败归为 network，是致命错误；超时与 5xx 不是", () => {
  const refused = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [new Error("Cannot connect to API: connect ECONNREFUSED 127.0.0.1:7897")] });
  assert.equal(classifyError(refused), "network");
  assert.match(describeAgentError(refused), /连不上模型服务：.*ECONNREFUSED 127\.0\.0\.1:7897.*代理/);
  assert.equal(isFatalAgentError("network"), true);
  assert.equal(isFatalAgentError("unavailable"), true);
  assert.equal(isFatalAgentError("timeout"), false);
  assert.equal(isFatalAgentError("provider_error"), false);
});

test("AgentRunError 按自己的 kind 描述，带上服务商原因", () => {
  const cause = apiError(402, JSON.stringify({ error: { message: "Payment required" } }));
  const error = new AgentRunError({ kind: "unavailable", agent: "x", runId: "r", message: "Payment required", durationMs: 1, cause });
  assert.equal(classifyError(error), "unavailable");
  assert.match(describeAgentError(error), /Payment required.*设置/);
  assert.equal(describeAgentError(new AgentRunError({ kind: "timeout", agent: "x", runId: "r", message: "t", durationMs: 1 })), "模型响应超时，可以重试。");
});
