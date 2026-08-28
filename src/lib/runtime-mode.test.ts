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

test("only whitelists the mock interview flow for trial writes", () => {
  assert.equal(isTrialWritablePath("/api/trial/resume"), true);
  assert.equal(isTrialWritablePath("/api/trial/ai-config"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/answer"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/complete"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/jd-strategy"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/retry-generation"), true);
  // 语音转写、设置、Boss 同步等一律拒绝。
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/transcribe"), false);
  assert.equal(isTrialWritablePath("/api/settings/ai"), false);
  assert.equal(isTrialWritablePath("/api/boss/sync"), false);
  assert.equal(isTrialWritablePath("/api/interviews/draft"), false);
});
