import assert from "node:assert/strict";
import test from "node:test";

import { fillFlags, sessionFlags } from "./flags";

test("开关：实验层默认关；flagsJson 里明确 true 才开；坏 JSON 按默认；补开关只填没定的项", () => {
  assert.deepEqual(sessionFlags(null), { lab: false, policy: null, shadow: null });
  assert.deepEqual(sessionFlags('{"lab":true,"policy":"v2-terse"}'), { lab: true, policy: "v2-terse", shadow: null });
  assert.deepEqual(sessionFlags('{"lab":"yes"}'), { lab: false, policy: null, shadow: null });
  assert.deepEqual(sessionFlags("{oops"), { lab: false, policy: null, shadow: null });
  assert.deepEqual(JSON.parse(fillFlags('{"policy":"v2-terse"}', { policy: "v2", shadow: "v2-terse" })), { lab: false, policy: "v2-terse", shadow: "v2-terse" });
  assert.deepEqual(JSON.parse(fillFlags(null, { policy: "v2", shadow: null })), { lab: false, policy: "v2", shadow: null });
});
