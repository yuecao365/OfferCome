import assert from "node:assert/strict";
import test from "node:test";

import type { MockInterviewJobBlueprint } from "../types";
import {
  buildBriefFromOutput,
  fallbackBrief,
  fallbackHypothesis,
  quickTarget,
  SCENARIOS_PER_PACE,
  parseStoredBrief,
  briefReady,
  type BriefOutput,
} from "./brief";

/**
 * 备课的代码把关（v8，材料；重建 v5 §6）：项目排序与兜底、基础题按配额取数并验锚点逐字、场景题数按节奏、JD 证据逐字、
 * 简历假设挂项目并兜底、业务。
 */

const jobDescription = "1、负责社交与通讯产品的后端开发；2、参与 API 设计与自动化测试；3、将智能对话能力融入产品。2027 届本科及以上。";

const blueprint: MockInterviewJobBlueprint = {
  summary: "全栈实习",
  completeness: "complete",
  missingInformation: [],
  business: null,
  competencies: [
    { id: "api", name: "API 设计", description: "设计并维护对外接口", priority: "core", jdEvidence: "参与 API 设计与自动化测试", origin: "jd", sourceUrl: null },
    { id: "ai", name: "智能对话集成", description: "", priority: "core", jdEvidence: "将智能对话能力融入产品", origin: "jd", sourceUrl: null },
  ],
};

const projects = [
  { id: "p1", name: "Study Assistant", description: "Agent Harness 主循环、分层记忆与工具协议" },
  { id: "p2", name: "校园二手平台", description: "退款状态机重构；库存超卖排查；Redis 缓存热门列表" },
];

const resumeText = "项目经历\nStudy Assistant ——基于 LLM Agent 的本地化个人助手 2026年4月–现在\n从零构建本地化个人助手，Agent Harness 主循环、分层记忆与工具协议，平均 prompt 长度降低约 50%。\n校园二手平台 2025年9月–2026年1月\n退款状态机重构，重复判断代码减少约四成；库存超卖排查。";

const topicNames = ["缓存一致性", "MySQL 索引", "消息队列可靠投递", "接口幂等"];

const projectOut = (projectId: string, question = "你负责哪一段？"): BriefOutput["projects"][number] => ({ projectId, question, leads: ["边界"], expectedSignals: ["职责"] });
const quickOut = (name: string, extra: Partial<BriefOutput["quick"][number]> = {}): BriefOutput["quick"][number] => ({ name, question: `${name}怎么保证？`, anchor: { kind: "resume", quote: "库存超卖排查" }, skill: "backend", followUp: "边界条件", expectedSignals: ["机制"], ...extra });
const scenarioOut = (overrides: Partial<BriefOutput["scenarios"][number]> = {}): BriefOutput["scenarios"][number] => ({
  name: "场景：接口限流",
  competencyIds: ["api", "ghost"],
  jdEvidence: "参与 API 设计与自动化测试",
  question: "接口被刷了你先做什么？",
  guides: ["一", "二", "三"],
  expectedSignals: ["有顺序"],
  ...overrides,
});

function build(output: Partial<BriefOutput>, extra: { pace?: "quick" | "standard" | "deep"; projects?: typeof projects } = {}) {
  return buildBriefFromOutput({
    output: { projects: [], quick: [], scenarios: [], hypotheses: [], ...output },
    blueprint,
    jobDescription,
    resumeText,
    projects: extra.projects ?? projects,
    topicNames,
    skillPacks: ["backend", "project-deep-dive"],
    pace: extra.pace ?? "standard",
    round: null,
    askIntro: true,
  });
}

const projectAreas = (brief: ReturnType<typeof build>) => brief.areas.filter((area) => area.kind === "project");

test("项目：模型先写到的排前面，每个项目一份材料，没写的用兜底问法与通用线索，不存在的项目丢弃", () => {
  const brief = build({ projects: [projectOut("p2", "先讲讲二手平台？"), projectOut("p9"), projectOut("p1", "主循环怎么做的？")] });
  const kept = projectAreas(brief);
  assert.deepEqual(kept.map((area) => [area.id, area.projectId, area.angle]), [["p1", "p2", null], ["p2", "p1", null]]);
  assert.equal(kept[0].entryQuestion, "先讲讲二手平台？");
  assert.deepEqual(kept[0].guides, ["边界"]);
  assert.equal(kept[1].entryQuestion, "主循环怎么做的？");
  assert.equal(kept[0].name, "校园二手平台");
  assert.deepEqual(kept[0].rubric.map((item) => item.name), ["事实与细节", "岗位关联", "复盘与表达"]);
  // 模型一个都没给：按简历顺序，每个项目一份，兜底问法与通用线索。
  const fallback = projectAreas(build({}));
  assert.equal(fallback.length, 2);
  assert.match(fallback[0].entryQuestion, /Study Assistant/);
  assert.equal(fallback[0].guides.length, 3);
  assert.equal(projectAreas(build({}, { projects: [] })).length, 0);
});

test("基础题：模型按 JD 与简历定，取配额那么多道；锚点逐字才认，skill 必须是备课用的包；不够的从主题清单补且没有锚点", () => {
  const brief = build({ quick: [quickOut("缓存一致性"), quickOut("MySQL 索引", { anchor: { kind: "jd", quote: "参与 API 设计与自动化测试" }, skill: "frontend" }), quickOut("消息队列", { anchor: { kind: "resume", quote: "改写过的一句" } }), quickOut("多余的第四道")] });
  const quick = brief.areas.filter((area) => area.kind === "quick");
  assert.equal(quick.length, quickTarget("standard", 2), "标准档 3 道");
  assert.deepEqual(quick.map((area) => [area.id, area.name]), [["q1", "缓存一致性"], ["q2", "MySQL 索引"], ["q3", "消息队列"]]);
  assert.deepEqual(quick[0].anchor, { kind: "resume", quote: "库存超卖排查" });
  assert.equal(quick[0].skill, "backend");
  assert.deepEqual(quick[1].anchor, { kind: "jd", quote: "参与 API 设计与自动化测试" });
  assert.equal(quick[1].skill, null, "不是备课用的包");
  assert.equal(quick[2].anchor, null, "改写过的引用不算锚点");
  assert.equal(quick[0].entryQuestion, "缓存一致性怎么保证？");
  assert.deepEqual(quick[0].rubric.map((item) => item.name), ["准确性", "原理深度", "表达结构"]);
  // 模型只写了一道：从领域包的主题清单按顺序补到配额，补的没有锚点、不与已有的重名。
  const short = build({ quick: [quickOut("MySQL 索引")] });
  const filled = short.areas.filter((area) => area.kind === "quick");
  assert.deepEqual(filled.map((area) => [area.name, area.anchor === null]), [["MySQL 索引", false], ["缓存一致性", true], ["消息队列可靠投递", true]]);
  assert.match(filled[1].entryQuestion, /缓存一致性/);
  // 简历没有项目：项目配额让给基础题。
  assert.equal(build({}, { projects: [], pace: "quick" }).areas.filter((area) => area.kind === "quick").length, quickTarget("quick", 0));
  assert.equal(quickTarget("quick", 0), 3);
});

test("场景题按节奏取数，JD 原句必须逐字、能力 id 必须在蓝图里，不够时代码兜底", () => {
  const brief = build({ scenarios: [scenarioOut(), scenarioOut({ name: "多余的" })] });
  const scenarios = brief.areas.filter((area) => area.kind === "scenario");
  assert.equal(scenarios.length, SCENARIOS_PER_PACE.standard);
  assert.deepEqual(scenarios[0].competencyIds, ["api"]);
  assert.equal(scenarios[0].jdEvidence, "参与 API 设计与自动化测试");
  const rewritten = build({ scenarios: [scenarioOut({ jdEvidence: "把 API 做好（改写）" })] });
  assert.equal(rewritten.areas.find((area) => area.kind === "scenario")?.jdEvidence, null);
  const deep = build({}, { pace: "deep" });
  assert.equal(deep.areas.filter((area) => area.kind === "scenario").length, SCENARIOS_PER_PACE.deep);
  assert.ok(deep.areas.find((area) => area.kind === "scenario")?.entryQuestion.includes("对外接口"), "兜底场景题落在蓝图核心能力上");
  // 顺序：项目 → 题池 → 场景。
  assert.deepEqual([...new Set(brief.areas.map((area) => area.kind))], ["project", "quick", "scenario"]);
});

test("简历假设：证据逐字、按 projectId 或简历段落挂到项目；没有假设的项目从简历里兜底一条", () => {
  const brief = build({
    projects: [projectOut("p1"), projectOut("p2")],
    hypotheses: [
      { id: "H1", text: "验证 50% 怎么量的", evidence: "平均 prompt 长度降低约 50%", projectId: null },
      { id: "H2", text: "改写过的证据", evidence: "prompt 长度降低了一半", projectId: "p1" },
    ],
  });
  assert.deepEqual(brief.hypotheses.map((item) => [item.id, item.projectId]), [["H1", "p1"], ["H-p2", "p2"]]);
  assert.equal(brief.hypotheses[1].evidence, "退款状态机重构，重复判断代码减少约四成");
  assert.equal(fallbackHypothesis("简历里没提这个项目", { id: "x", name: "不存在的项目" }), null);
  assert.equal(fallbackHypothesis("Study Assistant 2026年4月–现在", projects[0]), null);
});

test("兜底简报：基础题从主题清单按配额取、没有锚点；蓝图的业务带进简报", () => {
  const brief = fallbackBrief({ blueprint, jobDescription, resumeText, projects, topicNames, skillPacks: ["backend"], pace: "quick", round: null, askIntro: true });
  assert.equal(brief.source, "fallback");
  assert.equal(brief.product, null);
  assert.equal(projectAreas(brief).length, 2);
  assert.equal(brief.areas.filter((area) => area.kind === "scenario").length, 1);
  assert.deepEqual(brief.areas.filter((area) => area.kind === "quick").map((area) => [area.name, area.anchor]), [["缓存一致性", null], ["MySQL 索引", null]]);
  const withBusiness = fallbackBrief({ blueprint: { ...blueprint, business: { product: "社交 App 的后端", systems: ["消息链路"], constraints: null } }, jobDescription, resumeText, projects, topicNames, skillPacks: ["backend"], pace: "quick", round: null, askIntro: true });
  assert.equal(withBusiness.product, "社交 App 的后端");
});

test("只读 v8 简报：旧的按阶段预算、切入点或领域清单组织的简报视为没有简报", () => {
  const brief = build({});
  assert.deepEqual(parseStoredBrief(JSON.stringify(brief)), brief);
  assert.equal(parseStoredBrief(JSON.stringify({ ...brief, version: 7, plan: { project: 10, quick: 6, scenario: 3 } })), null);
  assert.equal(parseStoredBrief(JSON.stringify({ version: 5, pace: "standard", areas: [{ id: "a1", kind: "technical", depth: 2 }] })), null);
  assert.equal(parseStoredBrief("not json"), null);
});

test("备好了没：蓝图占位或简报兜底都算没备好", () => {
  const modelBrief = build({});
  assert.equal(briefReady(blueprint, modelBrief), true);
  assert.equal(briefReady({ competencies: [{ ...blueprint.competencies[0], id: "fallback-core" }] }, modelBrief), false);
  assert.equal(briefReady({ competencies: [] }, modelBrief), false);
  assert.equal(briefReady(blueprint, { source: "fallback" }), false);
});

