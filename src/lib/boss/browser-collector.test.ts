import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBossSessionUsable,
  BossBrowserClosedError,
  BossBrowserLoginRequiredError,
  describeBossAccessIssue,
  isBossLoginUrl,
} from "./browser-collector";

const RECOMMEND_URL = "https://www.zhipin.com/web/geek/recommend";
const LOGIN_URL = "https://www.zhipin.com/web/user/";

function checkSession(overrides: {
  currentUrl?: string | null;
  issue?: { code: number | null; message: string } | null;
  collectedResponses?: number;
  duringSync?: boolean;
}) {
  return () =>
    assertBossSessionUsable({
      currentUrl: overrides.currentUrl ?? RECOMMEND_URL,
      issue: overrides.issue ?? null,
      collectedResponses: overrides.collectedResponses ?? 0,
      duringSync: overrides.duringSync ?? false,
    });
}

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

test("lets a healthy session through", () => {
  assert.doesNotThrow(
    checkSession({ collectedResponses: 3 }),
    "拿到数据且无异常时不该打断同步",
  );
});

test("trusts the login page over the response code", () => {
  // URL 是确凿证据：即使接口返回的错误码不在白名单里，也要报未登录，
  // 而不是丢一个用户看不懂的 code。
  assert.throws(
    checkSession({
      currentUrl: LOGIN_URL,
      issue: { code: 7, message: "系统繁忙" },
    }),
    BossBrowserLoginRequiredError,
  );
});

test("still recognizes the known login codes", () => {
  for (const code of [32, 36, 37]) {
    assert.throws(
      checkSession({ issue: { code, message: "" } }),
      BossBrowserLoginRequiredError,
    );
  }
  assert.throws(
    checkSession({ issue: { code: 999, message: "请重新登录后重试" } }),
    BossBrowserLoginRequiredError,
  );
});

test("treats an unknown error with zero data as an expired session", () => {
  // 回归点：code=7 曾被判成硬失败，用户只看到"请稍后重试"——
  // 而重试永远不会成功，真正要做的是重新登录。
  let raised: unknown;
  try {
    checkSession({ issue: { code: 7, message: "系统繁忙" } })();
  } catch (error) {
    raised = error;
  }

  assert.ok(raised instanceof BossBrowserLoginRequiredError);
  assert.match(raised.message, /登录状态很可能已经失效/);
  // Boss 的原话必须带出来，否则下次排查还得靠猜。
  assert.match(raised.message, /code=7/);
  assert.match(raised.message, /系统繁忙/);
});

test("keeps an unknown error a hard failure once data has arrived", () => {
  // 已经采到数据说明登录是好的，这时的异常是真异常，不能误导用户去重新登录。
  let raised: unknown;
  try {
    checkSession({
      issue: { code: 7, message: "系统繁忙" },
      collectedResponses: 12,
      duringSync: true,
    })();
  } catch (error) {
    raised = error;
  }

  assert.ok(raised instanceof Error);
  assert.ok(!(raised instanceof BossBrowserLoginRequiredError));
  assert.match(raised.message, /code=7：系统繁忙/);
});

test("survives a page whose URL could not be read", () => {
  assert.doesNotThrow(checkSession({ currentUrl: null, collectedResponses: 1 }));
  assert.throws(
    checkSession({ currentUrl: null, issue: { code: 7, message: "" } }),
    BossBrowserLoginRequiredError,
  );
});

test("describes an access issue without leaving empty brackets", () => {
  assert.equal(describeBossAccessIssue({ code: 7, message: "系统繁忙" }), "（code=7：系统繁忙）");
  assert.equal(describeBossAccessIssue({ code: 7, message: "" }), "（code=7）");
  assert.equal(describeBossAccessIssue({ code: null, message: "出错了" }), "（出错了）");
  assert.equal(describeBossAccessIssue({ code: null, message: "" }), "");
});
