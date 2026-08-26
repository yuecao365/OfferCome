import assert from "node:assert/strict";
import { test } from "node:test";

import { advancedStage, suggestedStageForSourceChange } from "./stage-advance";
import { APPLICATION_STAGES, type ApplicationStage } from "./types";

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

function suggest(overrides: {
  currentStage: ApplicationStage;
  hasNewActivity?: boolean;
  hasJobClosed?: boolean;
}) {
  return suggestedStageForSourceChange({
    currentStage: overrides.currentStage,
    hasNewActivity: overrides.hasNewActivity ?? false,
    hasJobClosed: overrides.hasJobClosed ?? false,
  });
}

test("suggests the next interview round when Boss reports new activity", () => {
  const next = (currentStage: ApplicationStage) =>
    suggest({ currentStage, hasNewActivity: true });

  assert.equal(next("assessment"), "first_interview");
  assert.equal(next("first_interview"), "second_interview");
  assert.equal(next("second_interview"), "third_interview");
  assert.equal(next("third_interview"), "hr_interview");
});

test("stays silent when the applied stage sees new activity", () => {
  // 「已投递」的新互动可能只是 HR 打了个招呼，猜错的纠正成本高于省下的一次点击。
  assert.equal(suggest({ currentStage: "applied", hasNewActivity: true }), null);
});

test("never suggests a terminal stage from new activity", () => {
  // HR 面之后是 Offer 或拒绝，两者都太重，必须由用户自己判断。
  for (const currentStage of ["hr_interview", "offer", "rejected"] as const) {
    assert.equal(suggest({ currentStage, hasNewActivity: true }), null);
  }
});

test("suggests rejection when the job is taken down before any interview", () => {
  // 还没面过就被下架，基本等于这条线走完了。
  assert.equal(suggest({ currentStage: "applied", hasJobClosed: true }), "rejected");
  assert.equal(suggest({ currentStage: "assessment", hasJobClosed: true }), "rejected");
});

test("stays silent when a job is taken down after interviews started", () => {
  // 面过之后岗位关闭是有歧义的：可能是招到人了，甚至就是你。
  for (const currentStage of [
    "first_interview",
    "second_interview",
    "third_interview",
    "hr_interview",
  ] as const) {
    assert.equal(suggest({ currentStage, hasJobClosed: true }), null);
  }
});

test("does not re-suggest a stage an application already reached", () => {
  assert.equal(suggest({ currentStage: "rejected", hasJobClosed: true }), null);
  assert.equal(suggest({ currentStage: "offer", hasJobClosed: true }), null);
});

test("lets a closed job outrank a moved activity timestamp", () => {
  // 下架是确定性的信号，时间戳前进只说明"有互动"，冲突时以下架为准。
  assert.equal(
    suggest({ currentStage: "applied", hasNewActivity: true, hasJobClosed: true }),
    "rejected",
  );
});

test("suggests nothing when neither signal fired", () => {
  // 公司改名、岗位改名都不代表流程有进展。
  for (const currentStage of APPLICATION_STAGES) {
    assert.equal(suggest({ currentStage }), null);
  }
});

test("never suggests moving an application backwards", () => {
  for (const currentStage of APPLICATION_STAGES) {
    for (const signal of [{ hasNewActivity: true }, { hasJobClosed: true }]) {
      const suggestion = suggest({ currentStage, ...signal });
      if (!suggestion) continue;
      assert.ok(
        APPLICATION_STAGES.indexOf(suggestion) >
          APPLICATION_STAGES.indexOf(currentStage),
        `${currentStage} 的建议 ${suggestion} 不应该回退`,
      );
    }
  }
});
