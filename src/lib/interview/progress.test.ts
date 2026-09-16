import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import type { TranscriptLine } from "./events";
import { BUDGET, MAX_PROJECT_BUDGET, nextMaterial, pickFacet, planQuota, progressOf, QUOTA, seededRandom } from "./progress";

/** 覆盖配额（§10）：节奏定聊几份材料、每份几句；进度从逐字稿现算；角度加权随机但可重放。 */

let seq = 0;
const ask = (topic: string | null, facet: number | null = null, doneFacet: number | null = null): TranscriptLine => ({ seq: seq++, role: "interviewer", content: "问？", kind: "say", control: null, topic, facet, doneFacet });
const say = (content = "答"): TranscriptLine => ({ seq: seq++, role: "candidate", content, kind: null, control: null });

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

test("进度：当前材料、已问几句、预算余量、每个角度追了几句、讲透的角度；下一份材料按计划", () => {
  const plan = planQuota(testBrief());
  const empty = progressOf(plan, [ask(null), say()]);
  assert.equal(empty.current, null);
  assert.equal(empty.covered, 0);
  assert.equal(nextMaterial(empty)?.id, "p1-overview");
  const mid = progressOf(plan, [ask(null), say(), ask("p1-overview"), say(), ask("p1-overview", 1), say(), ask("p1-overview", 1, 1), say(), ask("p1-overview", 0)]);
  assert.equal(mid.current?.id, "p1-overview");
  assert.equal(mid.covered, 1);
  assert.equal(mid.quota, 6);
  assert.equal(mid.asked, 4);
  assert.equal(mid.budgetLeft, 0);
  const aside: TranscriptLine = { seq: 99, role: "interviewer", content: "我把题说具体一点。", kind: "aside", control: null, topic: "p1-overview", facet: 0, doneFacet: null };
  assert.equal(progressOf(plan, [ask("p1-overview"), say(), aside, say()]).asked, 1, "答疑不占预算");
  assert.equal(mid.facet, 0);
  assert.deepEqual(mid.facetProbes, { 1: 2, 0: 1 });
  assert.deepEqual(mid.doneFacets, [1]);
  assert.equal(nextMaterial(mid)?.id, "p1-module");
  assert.equal(nextMaterial(progressOf(plan, [ask("s1")])), null);
});

test("抽角度：项目按岗位相关度加权随机、同一种子同一结果；讲透或追满 2 句的角度不再抽；基础题 / 场景题按顺序", () => {
  const project = testBrief().areas.find((area) => area.id === "p1-module")!;
  const fresh = { facet: null, facetProbes: {}, doneFacets: [] };
  assert.equal(pickFacet(project, fresh, "seed-a"), pickFacet(project, fresh, "seed-a"));
  const counts = [0, 0, 0];
  for (let index = 0; index < 300; index += 1) counts[pickFacet(project, fresh, `seed-${index}`)!] += 1;
  assert.ok(counts[0] > counts[1] && counts[1] > counts[2], `权重 3:2:1，实际 ${counts.join(":")}`);
  assert.equal(pickFacet(project, { facet: 0, facetProbes: { 0: 2 }, doneFacets: [1] }, "x"), 2, "0 追满、1 讲透，只剩 2");
  assert.equal(pickFacet(project, { facet: 2, facetProbes: { 0: 2, 2: 1 }, doneFacets: [1] }, "x"), null, "当前角度之外没有可抽的");
  const scenario = testBrief().areas.find((area) => area.id === "s1")!;
  assert.equal(pickFacet(scenario, fresh, "any"), 0);
  assert.equal(pickFacet(scenario, { facet: 0, facetProbes: { 0: 1 }, doneFacets: [] }, "any"), 1);
  assert.ok(seededRandom("a") >= 0 && seededRandom("a") < 1 && seededRandom("a") !== seededRandom("b"));
});
