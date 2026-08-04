import assert from "node:assert/strict";
import test from "node:test";

import { isDemoMode, isPublicDemoPath } from "./runtime-mode";

test("uses demo mode when explicitly configured", () => {
  assert.equal(isDemoMode({ APP_MODE: "demo", VERCEL: undefined }), true);
});

test("treats Vercel deployments as public demos", () => {
  assert.equal(isDemoMode({ APP_MODE: undefined, VERCEL: "1" }), true);
});

test("keeps local and Docker runtimes fully enabled", () => {
  assert.equal(isDemoMode({ APP_MODE: "local", VERCEL: undefined }), false);
});

test("allows only static showcase routes in demo mode", () => {
  assert.equal(isPublicDemoPath("/showcase"), true);
  assert.equal(isPublicDemoPath("/homepage"), true);
  assert.equal(isPublicDemoPath("/_next/static/app.js"), true);
  assert.equal(isPublicDemoPath("/applications"), false);
  assert.equal(isPublicDemoPath("/api/resumes"), false);
});
