import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { planMaterials, REFERENCE_COUNT, REFERENCE_TURNS } from "./progress";

/** 参考值不是配额（agent-freedom-plan §2）：简报里有什么就聊什么，每份材料只带一个参考句数。 */

test("材料按 项目 → 基础 → 场景 排，每份带种类的参考句数；不截断、不补足", () => {
  const plan = planMaterials(testBrief());
  assert.deepEqual(plan.map((item) => [item.id, item.reference]), [["p1-overview", 4], ["p1-module", 4], ["q1", 2], ["q2", 2], ["q3", 2], ["q4", 2], ["s1", 3]]);
  const brief = testBrief({ pace: "quick" });
  assert.equal(planMaterials(brief).length, brief.areas.length, "快速档也不按配额截");
  assert.equal(planMaterials({ pace: "quick", areas: brief.areas.filter((area) => area.kind !== "project") }).length, brief.areas.filter((area) => area.kind !== "project").length);
  assert.deepEqual(planMaterials(testBrief()).map((item) => item.lane), ["main", "main", "main", "main", "main", "backup", "main"], "标准节奏：2 项目 + 3 基础 + 1 场景是主线，第 4 道基础题是备选");
});

test("参考值表：三档的材料数与每种材料的句数", () => {
  assert.deepEqual(REFERENCE_COUNT.standard, { project: 2, quick: 3, scenario: 1 });
  assert.deepEqual(REFERENCE_TURNS, { project: 4, quick: 2, scenario: 3 });
});
