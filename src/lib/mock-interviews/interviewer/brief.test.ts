import assert from "node:assert/strict";
import test from "node:test";

import type { MockInterviewJobBlueprint } from "../types";
import { buildBriefFromOutput, PACE_PLAN, planAreas, plannedTurns, type BriefOutput } from "./brief";

/**
 * 备课的代码把关（v5，广度优先）：项目去重、技术领域不挂项目、JD 证据逐字、装箱先压深度再丢领域。
 */

const jobDescription = "1、负责社交与通讯产品的后端开发；2、参与 API 设计与自动化测试；3、将智能对话能力融入产品。";

const blueprint: MockInterviewJobBlueprint = {
  summary: "全栈实习",
  completeness: "complete",
  missingInformation: [],
  competencies: [
    { id: "api", name: "API 设计", description: "", priority: "core", jdEvidence: "参与 API 设计与自动化测试", origin: "jd", sourceUrl: null },
    { id: "ai", name: "智能对话集成", description: "", priority: "core", jdEvidence: "将智能对话能力融入产品", origin: "jd", sourceUrl: null },
  ],
};

const projects = [
  { id: "p1", name: "Study Assistant", description: "Agent Harness 主循环、分层记忆与工具协议" },
  { id: "p2", name: "校园二手平台", description: "退款状态机重构；库存超卖排查；Redis 缓存热门列表" },
];

function area(overrides: Partial<BriefOutput["areas"][number]> & { id: string; name: string }): BriefOutput["areas"][number] {
  return {
    kind: "technical",
    style: "scenario",
    description: "描述",
    projectId: null,
    competencyIds: [],
    jdEvidence: null,
    baseline: null,
    weight: 2,
    depth: 2,
    entryQuestion: "一个与项目无关的场景题？",
    ladder: [{ text: "一", style: "fact" }, { text: "二", style: "principle" }],
    expectedSignals: ["信号"],
    ...overrides,
  };
}

function build(areas: BriefOutput["areas"], pace: "quick" | "standard" | "deep" = "standard") {
  return buildBriefFromOutput({
    output: { areas, hypotheses: [] },
    blueprint,
    jobDescription,
    resumeText: "简历",
    projects,
    loadedSkills: ["backend"],
    pace,
    round: null,
    askIntro: true,
  });
}

test("每个简历项目最多一个领域，多出来的记进 droppedAreas", () => {
  const brief = build([
    area({ id: "a1", name: "项目深挖", kind: "project", style: null, projectId: "p1" }),
    area({ id: "a2", name: "项目再挖", kind: "project", style: null, projectId: "p1" }),
    area({ id: "a3", name: "不存在的项目", kind: "project", style: null, projectId: "p9" }),
    area({ id: "a4", name: "API 设计", competencyIds: ["api"], jdEvidence: "参与 API 设计与自动化测试" }),
  ]);
  assert.deepEqual(brief.areas.map((item) => item.id), ["a1", "a4"]);
  assert.deepEqual(brief.droppedAreas, ["项目再挖", "不存在的项目"]);
});

test("点名了简历项目的技术领域并入该项目：没有项目领域时转成 project，已有时丢弃", () => {
  const brief = build([
    area({ id: "a1", name: "Agent 多任务调度", entryQuestion: "你在 Study Assistant 里怎么调度子任务？" }),
    area({ id: "a2", name: "记忆分层", entryQuestion: "Study Assistant 的分层记忆怎么设计的？" }),
    // 没点名项目，但用第二人称引出了项目描述里的内容：也是项目题。
    area({ id: "a5", name: "MySQL 事务", entryQuestion: "你在排查库存超卖时，MySQL 事务和 Redis 的时序缺口是怎么产生的？" }),
    // 纯场景题里的"你在"不算。
    area({ id: "a6", name: "缓存一致性", entryQuestion: "如果你在一个秒杀系统里先扣 Redis 再落库，偶发超卖会出在哪一步？" }),
    area({ id: "a3", name: "API 设计", competencyIds: ["api"], jdEvidence: "参与 API 设计与自动化测试" }),
  ]);
  assert.deepEqual(
    brief.areas.map((item) => [item.id, item.kind, item.projectId]),
    [["a1", "project", "p1"], ["a5", "project", "p2"], ["a6", "technical", null], ["a3", "technical", null]],
  );
  assert.deepEqual(brief.areas[0].rubric.map((item) => item.name), ["事实与细节", "岗位关联", "复盘与表达"]);
  assert.deepEqual(brief.droppedAreas, ["记忆分层"]);
});

test("JD 来源的领域必须带逐字的 jdEvidence，否则视为无来源；基线必须是加载过的包", () => {
  const brief = build([
    area({ id: "a1", name: "API 设计", competencyIds: ["api"], jdEvidence: "参与 API 设计与自动化测试" }),
    area({ id: "a2", name: "智能对话", competencyIds: ["ai"], jdEvidence: "把 AI 对话做进产品（改写）" }),
    area({ id: "a3", name: "MySQL 索引", baseline: { skill: "backend", topic: "索引" } }),
    area({ id: "a4", name: "Redis", baseline: { skill: "not-loaded", topic: "缓存" } }),
  ]);
  const byId = new Map(brief.areas.map((item) => [item.id, item]));
  assert.deepEqual(byId.get("a1")?.competencyIds, ["api"]);
  assert.equal(byId.get("a2")?.jdEvidence, null);
  assert.deepEqual(byId.get("a2")?.competencyIds, []);
  assert.equal(byId.get("a3")?.baseline?.skill, "backend");
  assert.equal(byId.get("a4")?.baseline, null);
});

test("装箱先把深度压到节奏上限，再削最深的领域，都只剩一层才按权重丢", () => {
  const many = Array.from({ length: 6 }, (_, index) => area({ id: `a${index}`, name: `领域${index}`, depth: 4, weight: index === 5 ? 1 : 2 }));
  const quick = planAreas(many, "quick", true);
  // 快速节奏 10 回合：6 个领域各 1 层要 13 回合，装不下就丢权重最低的，直到装下。
  assert.ok(plannedTurns(quick.areas, true) <= PACE_PLAN.quick.turns);
  assert.ok(quick.areas.every((item) => item.depth <= PACE_PLAN.quick.maxDepth));
  assert.equal(quick.dropped[0], "领域5");
  assert.ok(quick.areas.length >= PACE_PLAN.quick.minAreas);

  const standard = planAreas(many, "standard", true);
  assert.equal(standard.dropped.length, 0);
  assert.ok(plannedTurns(standard.areas, true) <= PACE_PLAN.standard.turns);
  assert.ok(standard.areas.every((item) => item.depth <= PACE_PLAN.standard.maxDepth));
});
