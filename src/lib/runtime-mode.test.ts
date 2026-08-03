import assert from "node:assert/strict";
import test from "node:test";

import { isDemoMode } from "./runtime-mode";

test("uses demo mode when explicitly configured", () => {
  assert.equal(isDemoMode({ APP_MODE: "demo", VERCEL: undefined }), true);
});

test("treats Vercel deployments as public demos", () => {
  assert.equal(isDemoMode({ APP_MODE: undefined, VERCEL: "1" }), true);
});

test("keeps local and Docker runtimes fully enabled", () => {
  assert.equal(isDemoMode({ APP_MODE: "local", VERCEL: undefined }), false);
});
