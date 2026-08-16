import assert from "node:assert/strict";
import { test } from "node:test";

import { advancedStage } from "./stage-advance";

test("advancedStage 按轮次推进投递阶段", () => {
  assert.equal(advancedStage("applied", "first_interview"), "first_interview");
  assert.equal(advancedStage("applied", "second_interview"), "second_interview");
  assert.equal(
    advancedStage("first_interview", "third_interview"),
    "third_interview",
  );
  assert.equal(advancedStage("assessment", "hr_interview"), "hr_interview");
});

test("advancedStage 不降级", () => {
  assert.equal(advancedStage("third_interview", "first_interview"), null);
  assert.equal(advancedStage("second_interview", "second_interview"), null);
  assert.equal(advancedStage("hr_interview", "other"), null);
});

test("advancedStage 对终态不做任何推进", () => {
  assert.equal(advancedStage("offer", "hr_interview"), null);
  assert.equal(advancedStage("rejected", "first_interview"), null);
});

test("advancedStage 在轮次缺失或为 other 时按一面处理", () => {
  assert.equal(advancedStage("applied", null), "first_interview");
  assert.equal(advancedStage("applied", "other"), "first_interview");
  assert.equal(advancedStage("first_interview", null), null);
});
