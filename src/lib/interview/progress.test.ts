import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { BUDGET, MAX_PROJECT_BUDGET, planQuota, QUOTA } from "./progress";

/** 覆盖配额（§10）：节奏定聊几份材料、每份几句；进度从逐字稿现算；角度加权随机但可重放。 */


test("配额：标准档 2 项目 + 3 基础 + 1 场景，顺序项目 → 基础 → 场景，预算按种类", () => {
  const plan = planQuota(testBrief());
  assert.deepEqual(plan.map((item) => [item.id, item.budget]), [["p1-overview", 4], ["p1-module", 4], ["q1", 2], ["q2", 2], ["q3", 2], ["s1", 3]]);
  assert.equal(plan.reduce((sum, item) => sum + item.budget, 0), 17);
  assert.equal(planQuota(testBrief({ pace: "quick" })).map((item) => item.id).join(","), "p1-overview,q1,q2,s1");
});

test("项目不够配额：缺的预算分给现有项目、每个最多 6 句；没有项目时配额让给题池", () => {
  const brief = testBrief({ pace: "deep" });
  const plan = planQuota(brief);
  assert.deepEqual(plan.filter((item) => item.kind === "project").map((item) => item.budget), [MAX_PROJECT_BUDGET, MAX_PROJECT_BUDGET], "深入档 3 个项目只有 2 段经历：各 6 句");
  const one = planQuota({ pace: "deep", areas: brief.areas.filter((area) => area.id !== "p1-module") });
  assert.deepEqual(one.filter((item) => item.kind === "project").map((item) => item.budget), [MAX_PROJECT_BUDGET], "只有一段经历：6 句封顶，分不完的不补");
  const none = planQuota({ pace: "quick", areas: brief.areas.filter((area) => area.kind !== "project") });
  assert.equal(none.filter((item) => item.kind === "quick").length, QUOTA.quick.quick + QUOTA.quick.project);
  assert.equal(none[0].budget, BUDGET.quick);
});
