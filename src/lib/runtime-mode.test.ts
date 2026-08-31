import assert from "node:assert/strict";
import test from "node:test";

import { isTrialMode, isTrialWritablePath } from "./runtime-mode";

test("显式 APP_MODE=trial 即网页版", () => {
  assert.equal(isTrialMode({ APP_MODE: "trial", VERCEL: undefined }), true);
});

test("Vercel 上默认按网页版跑：环境变量漏配也不会暴露会写服务端的实例", () => {
  assert.equal(isTrialMode({ APP_MODE: undefined, VERCEL: "1" }), true);
});

test("显式 APP_MODE=local 可以压过 Vercel 默认", () => {
  assert.equal(isTrialMode({ APP_MODE: "local", VERCEL: "1" }), false);
});

test("本机与 Docker 运行时是完整的本地版", () => {
  assert.equal(isTrialMode({ APP_MODE: undefined, VERCEL: undefined }), false);
  assert.equal(isTrialMode({ APP_MODE: "local", VERCEL: undefined }), false);
});

test("网页版只放行无状态计算接口", () => {
  assert.equal(isTrialWritablePath("/api/trial/interview"), true);
  assert.equal(isTrialWritablePath("/api/trial/assess"), true);
  assert.equal(isTrialWritablePath("/api/resumes"), false);
  assert.equal(isTrialWritablePath("/api/boss/sync"), false);
});
