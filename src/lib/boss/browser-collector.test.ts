import assert from "node:assert/strict";
import test from "node:test";

import {
  BossBrowserClosedError,
  BossBrowserLoginRequiredError,
  isBossLoginUrl,
} from "./browser-collector";

test("recognizes the Boss login and verification URLs", () => {
  assert.equal(isBossLoginUrl("https://www.zhipin.com/web/user/"), true);
  assert.equal(isBossLoginUrl("https://www.zhipin.com/web/user"), true);
  assert.equal(
    isBossLoginUrl("https://www.zhipin.com/web/user/safe/verify-slider"),
    true,
  );
  assert.equal(
    isBossLoginUrl("https://www.zhipin.com/web/geek/recommend"),
    false,
  );
});

test("keeps actionable browser errors distinct", () => {
  assert.match(new BossBrowserClosedError().message, /保持窗口打开/);
  assert.equal(
    new BossBrowserLoginRequiredError("需要登录").name,
    "BossBrowserLoginRequiredError",
  );
});
