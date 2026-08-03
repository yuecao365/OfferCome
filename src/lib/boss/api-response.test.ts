import assert from "node:assert/strict";
import test from "node:test";

import {
  getBossApiCode,
  getBossApiMessage,
  getBossHasMore,
  isBossLoginRequiredCode,
  isBossLoginRequiredResponse,
} from "./api-response";

test("reads only the Boss response fields used by sync", () => {
  const payload = {
    code: 0,
    message: "ok",
    zpData: { hasMore: false, ignored: "not persisted" },
  };

  assert.equal(getBossApiCode(payload), 0);
  assert.equal(getBossApiMessage(payload), "ok");
  assert.equal(getBossHasMore(payload), false);
});

test("classifies login expiry, verification, and account restriction responses", () => {
  assert.equal(isBossLoginRequiredCode(32), true);
  assert.equal(isBossLoginRequiredCode(36), true);
  assert.equal(isBossLoginRequiredCode(37), true);
  assert.equal(isBossLoginRequiredCode(0), false);
  assert.equal(isBossLoginRequiredResponse(500, "请重新登录后继续使用"), true);
  assert.equal(isBossLoginRequiredResponse(500, "请求参数错误"), false);
});
