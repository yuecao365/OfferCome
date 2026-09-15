import assert from "node:assert/strict";
import test from "node:test";

import { assignVariant, bucketOf, policyVariant, rolloutConfig } from "./variants";

test("放量配置：默认全走 v2；不认识的变体按默认；坏 JSON 按默认；百分比夹在 0–100", () => {
  assert.deepEqual(rolloutConfig(undefined), { live: "v2", canary: null, shadow: null });
  assert.deepEqual(rolloutConfig('{"live":"v2","canary":{"variant":"v2-terse","percent":30},"shadow":"v2-terse"}'), { live: "v2", canary: { variant: "v2-terse", percent: 30 }, shadow: "v2-terse" });
  assert.deepEqual(rolloutConfig('{"live":"nope","canary":{"variant":"v2-terse","percent":0}}'), { live: "v2", canary: null, shadow: null });
  assert.deepEqual(rolloutConfig("{oops").live, "v2");
  assert.equal(rolloutConfig('{"canary":{"variant":"v2-terse","percent":500}}').canary?.percent, 100);
});

test("分桶：同一个 id 永远同一个桶；30% 灰度大致落三成", () => {
  assert.equal(bucketOf("cmu2abc"), bucketOf("cmu2abc"));
  const ids = Array.from({ length: 1000 }, (_, index) => `session-${index}`);
  const rollout = { live: "v2", canary: { variant: "v2-terse", percent: 30 }, shadow: null };
  const canary = ids.filter((id) => assignVariant(rollout, id) === "v2-terse").length;
  assert.ok(canary > 240 && canary < 360, String(canary));
  assert.equal(assignVariant({ live: "v2", canary: null, shadow: null }, "x"), "v2");
});

test("变体：不认识的 id 回到默认；terse 有追加规则", () => {
  assert.equal(policyVariant(undefined).id, "v2");
  assert.equal(policyVariant("nope").id, "v2");
  assert.equal(policyVariant("v2-terse").extraRules.length, 1);
});
