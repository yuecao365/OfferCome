import assert from "node:assert/strict";
import test from "node:test";

import {
  isDemoMode,
  isPublicDemoPath,
  isTrialMode,
  isTrialWritablePath,
} from "./runtime-mode";

test("uses demo mode when explicitly configured", () => {
  assert.equal(isDemoMode({ APP_MODE: "demo", VERCEL: undefined }), true);
});

test("treats Vercel deployments as public demos", () => {
  assert.equal(isDemoMode({ APP_MODE: undefined, VERCEL: "1" }), true);
});

test("trial mode overrides the Vercel demo default", () => {
  assert.equal(isDemoMode({ APP_MODE: "trial", VERCEL: "1" }), false);
  assert.equal(isTrialMode({ APP_MODE: "trial" }), true);
});

test("keeps local and Docker runtimes fully enabled", () => {
  assert.equal(isDemoMode({ APP_MODE: "local", VERCEL: undefined }), false);
});

test("allows the real read-only product routes in demo mode", () => {
  assert.equal(isPublicDemoPath("/showcase"), true);
  assert.equal(isPublicDemoPath("/homepage"), true);
  assert.equal(isPublicDemoPath("/_next/static/app.js"), true);
  assert.equal(isPublicDemoPath("/applications"), true);
  assert.equal(isPublicDemoPath("/resumes"), true);
  assert.equal(isPublicDemoPath("/interviews/mock/demo-session"), true);
  assert.equal(isPublicDemoPath("/settings"), true);
  assert.equal(isPublicDemoPath("/api/resumes"), false);
});

test("recognizes trial mode from its own APP_MODE value", () => {
  assert.equal(isTrialMode({ APP_MODE: "trial" }), true);
  assert.equal(isTrialMode({ APP_MODE: "demo" }), false);
  assert.equal(isTrialMode({}), false);
});

test("only lets the stateless trial endpoints write", () => {
  // 体验模式服务端无状态：只有 /api/trial/* 这组接口不碰任何存储。
  assert.equal(isTrialWritablePath("/api/trial/interview"), true);
  assert.equal(isTrialWritablePath("/api/trial/evaluate"), true);
  assert.equal(isTrialWritablePath("/api/trial/follow-up"), true);
  assert.equal(isTrialWritablePath("/api/trial/report"), true);
  assert.equal(isTrialWritablePath("/api/trial/resume"), true);
  assert.equal(isTrialWritablePath("/api/trial/ai-config"), true);

  // 其余写入口都会落到服务端存储上，在体验模式下没有意义。
  assert.equal(isTrialWritablePath("/api/interviews/mock"), false);
  assert.equal(isTrialWritablePath("/api/settings/ai"), false);
  assert.equal(isTrialWritablePath("/api/boss/sync"), false);
  assert.equal(isTrialWritablePath("/api/interviews/draft"), false);
  // Server Action 发往页面路径，同样拒绝——它们全都要写数据库。
  assert.equal(isTrialWritablePath("/applications"), false);
  assert.equal(isTrialWritablePath("/resumes"), false);
});
