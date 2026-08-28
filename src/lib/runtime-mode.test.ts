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

test("keeps the trial API surface on a strict whitelist", () => {
  assert.equal(isTrialWritablePath("/api/trial/resume"), true);
  assert.equal(isTrialWritablePath("/api/trial/ai-config"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/answer"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/complete"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/jd-strategy"), true);
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/retry-generation"), true);

  // 会把访客数据写出会话边界的一律拒绝。
  assert.equal(isTrialWritablePath("/api/settings/ai"), false, "设置写入会把 Key 落库");
  assert.equal(isTrialWritablePath("/api/boss/sync"), false, "服务器上没有访客的登录态");
  assert.equal(isTrialWritablePath("/api/boss/login"), false);
  assert.equal(isTrialWritablePath("/api/interviews/draft"), false, "录音导入要落文件");
  assert.equal(isTrialWritablePath("/api/interviews/mock/abc/transcribe"), false, "语音转写二期再开");
  assert.equal(isTrialWritablePath("/api/candidate-profile/refresh"), false);
});

test("lets server actions through so the workspace is actually usable", () => {
  // Server Action 由 Next 发往页面路径而不是 /api，按路径分不出具体动作；
  // 数据都落在访客自己的会话库，整体放行，个别危险动作在动作内部再挡。
  for (const page of ["/applications", "/interviews", "/interviews/history", "/interviews/review", "/resumes", "/trial", "/"]) {
    assert.equal(isTrialWritablePath(page), true, page + " 应放行 Server Action");
  }
});
