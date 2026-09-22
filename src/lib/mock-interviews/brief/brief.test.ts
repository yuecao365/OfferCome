import assert from "node:assert/strict";
import test from "node:test";

import type { MockInterviewJobBlueprint } from "../types";
import {
  buildBriefFromOutput,
  fallbackBrief,
  basisAccepted,
  fallbackHypothesis,
  fallbackJdHypothesis,
  MAX_SCENARIOS,
  parseStoredBrief,
  briefReady,
  type BriefOutput,
} from "./brief";

/**
 * 备课的代码把关（v8，材料；重建 v5 §6）：项目排序与兜底、基础题按配额取数并验依据、场景题数按节奏、JD 证据逐字、
 * 简历假设挂项目并兜底、业务。
 */

const jobDescription = "1、负责社交与通讯产品的后端开发；2、参与 API 设计与自动化测试；3、将智能对话能力融入产品。2027 届本科及以上。";

const blueprint: MockInterviewJobBlueprint = {
  summary: "全栈实习",
  completeness: "complete",
  missingInformation: [],
  business: null,
  competencies: [
    { id: "api", name: "API 设计", description: "设计并维护对外接口", jdEvidence: "参与 API 设计与自动化测试", origin: "jd", sourceUrl: null },
    { id: "ai", name: "智能对话集成", description: "", jdEvidence: "将智能对话能力融入产品", origin: "jd", sourceUrl: null },
  ],
};

const projects = [
  { id: "p1", name: "Study Assistant", description: "Agent Harness 主循环、分层记忆与工具协议" },
  { id: "p2", name: "校园二手平台", description: "退款状态机重构；库存超卖排查；Redis 缓存热门列表" },
];

const resumeText = "项目经历\nStudy Assistant ——基于 LLM Agent 的本地化个人助手 2026年4月–现在\n从零构建本地化个人助手，Agent Harness 主循环、分层记忆与工具协议，平均 prompt 长度降低约 50%。\n校园二手平台 2025年9月–2026年1月\n退款状态机重构，重复判断代码减少约四成；库存超卖排查。";

const topicNames = ["缓存一致性", "MySQL 索引", "消息队列可靠投递", "接口幂等"];

const projectOut = (projectId: string, question = "你负责哪一段？"): BriefOutput["projects"][number] => ({ projectId, question, leads: ["边界"], expectedSignals: ["职责"] });
const quickOut = (name: string, extra: Partial<BriefOutput["quick"][number]> = {}): BriefOutput["quick"][number] => ({ name, question: `${name}怎么保证？`, basis: { kind: "resume", quote: "库存超卖排查", note: "简历里做过" }, followUp: "边界条件", expectedSignals: ["机制"], ...extra });
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
  assert.deepEqual(kept[0].rubric.map((item) => item.name), ["事实与细节", "取舍与复盘", "表达结构"]);
  // 模型一个都没给：兜底只聊简历上的第一个项目（项目追问不能空），兜底问法与通用线索。
  const fallback = projectAreas(build({}));
  assert.equal(fallback.length, 1);
  assert.match(fallback[0].entryQuestion, /Study Assistant/);
  assert.equal(fallback[0].guides.length, 3);
  assert.equal(projectAreas(build({}, { projects: [] })).length, 0);
});

test("基础题：模型写几道就几道（上限 6，不按配额截也不补）；引用类验逐字（空格换行不计），推断类不引原文也算数", () => {
  const brief = build({
    quick: [
      quickOut("缓存一致性"),
      quickOut("MySQL 索引", { basis: { kind: "jd", quote: "参与 API 设计与自动化测试", note: "JD 要接口设计" } }),
      quickOut("消息队列", { basis: { kind: "resume", quote: "改写过的一句", note: "简历里有" } }),
      quickOut("多余的第四道"),
    ],
  });
  const quick = brief.areas.filter((area) => area.kind === "quick");
  assert.equal(quick.length, 4, "模型写了四道就四道");
  assert.deepEqual(quick.map((area) => [area.id, area.name]), [["q1", "缓存一致性"], ["q2", "MySQL 索引"], ["q3", "消息队列"], ["q4", "多余的第四道"]]);
  assert.deepEqual(quick[0].basis, { kind: "resume", quote: "库存超卖排查", note: "简历里做过" });
  assert.equal(quick[1].basis?.kind, "jd");
  assert.equal(quick[2].basis, null, "改写过的引用不算依据");
  assert.deepEqual(quick[0].rubric.map((item) => item.name), ["准确性", "原理深度", "表达结构"]);
  // 模型只写了一道：就一道，不从主题清单补。
  const one = build({ quick: [quickOut("MySQL 索引")] }).areas.filter((area) => area.kind === "quick");
  assert.deepEqual(one.map((area) => [area.name, area.basis === null]), [["MySQL 索引", false]]);
  assert.equal(build({}, { projects: [], pace: "quick" }).areas.filter((area) => area.kind === "quick").length, 0, "模型没写就没有");
});

test("依据：引用类必须给 quote 且逐字（PDF 换行插进来的空格不算改写）；落差与模式类不给 quote 也成立", () => {
  const sources = { resumeText, jobDescription };
  const ok = (basis: Parameters<typeof basisAccepted>[0]) => basisAccepted(basis, sources);
  assert.equal(ok({ kind: "resume", quote: "库存超卖排查", note: "n" }), true);
  // 真实简历从 PDF 抽出来会在换行处插空格，模型照抄原文也会差这一个空格（2026-09-18 真实场次 10 条引用全被误杀）。
  assert.equal(ok({ kind: "resume", quote: "AgentHarness 主循环、分层记忆与工具协议", note: "n" }), true, "少一个空格仍算逐字");
  assert.equal(ok({ kind: "resume", quote: "Agent  Harness主循环 、分层记忆与工具协议", note: "n" }), true, "多几个空格也算");
  assert.equal(ok({ kind: "resume", quote: "prompt 长度降低了一半", note: "n" }), false, "改写不算");
  assert.equal(ok({ kind: "jd", quote: "参与 API 设计与自动化测试", note: "n" }), true);
  assert.equal(ok({ kind: "jd", quote: "库存超卖排查", note: "n" }), false, "简历里的句子不算 JD 原文");
  assert.equal(ok({ kind: "resume", quote: null, note: "简历里有" }), false, "引用类必须给 quote");
  assert.equal(ok({ kind: "gap", quote: null, note: "JD 要质量保障，简历全是模型应用" }), true);
  assert.equal(ok({ kind: "pattern", quote: null, note: "两个项目都没提协作与评审" }), true);
  assert.equal(ok({ kind: "gap", quote: "编的一句 JD", note: "n" }), false, "给了 quote 就要验");
});

test("场景题模型写几道就几道（上限 2），JD 原句必须逐字、能力 id 必须在蓝图里，不补", () => {
  const brief = build({ quick: [quickOut("缓存一致性")], scenarios: [scenarioOut(), scenarioOut({ name: "多余的" }), scenarioOut({ name: "第三道" })] });
  const scenarios = brief.areas.filter((area) => area.kind === "scenario");
  assert.equal(scenarios.length, MAX_SCENARIOS);
  assert.deepEqual(scenarios[0].competencyIds, ["api"]);
  assert.equal(scenarios[0].jdEvidence, "参与 API 设计与自动化测试");
  const rewritten = build({ scenarios: [scenarioOut({ jdEvidence: "把 API 做好（改写）" })] });
  assert.equal(rewritten.areas.find((area) => area.kind === "scenario")?.jdEvidence, null);
  assert.equal(build({}, { pace: "deep" }).areas.filter((area) => area.kind === "scenario").length, 0, "模型没写就没有");
  // 顺序：项目 → 题池 → 场景。
  assert.deepEqual([...new Set(brief.areas.map((area) => area.kind))], ["project", "quick", "scenario"]);
});

test("简历假设：证据逐字、按 projectId 或简历段落挂到项目；没有假设的项目从简历里兜底一条", () => {
  const brief = build({
    projects: [projectOut("p1"), projectOut("p2")],
    hypotheses: [
      { id: "H1", source: "resume", text: "验证 50% 怎么量的", evidence: "平均 prompt 长度降低约 50%", projectId: null },
      { id: "H2", source: "resume", text: "改写过的证据", evidence: "prompt 长度降低了一半", projectId: "p1" },
    ],
  });
  assert.deepEqual(brief.hypotheses.map((item) => [item.id, item.projectId]), [["H1", "p1"], ["H-p2", "p2"], ["J-api", null]], "模型没写岗位假设：从蓝图第一条 JD 能力兜底一条");
  assert.equal(brief.hypotheses[1].evidence, "退款状态机重构，重复判断代码减少约四成");
  assert.equal(fallbackHypothesis("简历里没提这个项目", { id: "x", name: "不存在的项目" }), null);
  assert.equal(fallbackHypothesis("Study Assistant 2026年4月–现在", projects[0]), null);
});

test("岗位假设：证据逐字出自 JD 才收，projectId 可空；写了就不再兜底；兜底简报也带一条", () => {
  const brief = build({
    hypotheses: [
      { id: "J1", source: "jd", text: "岗位要求智能对话融入产品，简历没提，验证是否碰过", evidence: "将智能对话能力融入产品", projectId: null },
      { id: "J2", source: "jd", text: "改写过的 JD", evidence: "要会做对话机器人", projectId: null },
    ],
  });
  assert.deepEqual(brief.hypotheses.filter((item) => item.source === "jd").map((item) => [item.id, item.evidence, item.projectId]), [["J1", "将智能对话能力融入产品", null]]);
  assert.deepEqual(fallbackJdHypothesis(blueprint)?.id, "J-api");
  assert.equal(fallbackJdHypothesis({ competencies: [] }), null);
  const fallback = fallbackBrief({ blueprint, jobDescription, resumeText, projects, topicNames, skillPacks: ["backend"], pace: "quick", askIntro: true });
  assert.deepEqual(fallback.hypotheses.map((item) => [item.source, item.evidence]), [["jd", "参与 API 设计与自动化测试"]]);
});

test("兜底简报：基础题从主题清单按配额取、没有依据；蓝图的业务带进简报", () => {
  const brief = fallbackBrief({ blueprint, jobDescription, resumeText, projects, topicNames, skillPacks: ["backend"], pace: "quick", askIntro: true });
  assert.equal(brief.source, "fallback");
  assert.equal(brief.product, null);
  assert.equal(projectAreas(brief).length, 1, "项目材料只建到节奏配额（快速档 1 个），多建的问不到还会跟着议程回放");
  assert.equal(brief.areas.filter((area) => area.kind === "scenario").length, 1);
  assert.deepEqual(brief.areas.filter((area) => area.kind === "quick").map((area) => [area.name, area.basis]), [["缓存一致性", null], ["MySQL 索引", null]]);
  const withBusiness = fallbackBrief({ blueprint: { ...blueprint, business: { product: "社交 App 的后端", systems: ["消息链路"], constraints: null } }, jobDescription, resumeText, projects, topicNames, skillPacks: ["backend"], pace: "quick", askIntro: true });
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

