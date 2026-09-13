import assert from "node:assert/strict";
import test from "node:test";

import type { SkillTopic } from "../skills/topics";
import type { MockInterviewJobBlueprint } from "../types";
import {
  ANGLES_BY_RANK,
  buildBriefFromOutput,
  fallbackBrief,
  fallbackHypothesis,
  guessLevel,
  PACE_PLAN,
  parseStoredBrief,
  plannedTurns,
  poolSizeFor,
  probeLimitFor,
  PROJECT_ANGLE_ORDER,
  type BriefOutput,
} from "./brief";

/**
 * 备课的代码把关（v7，按阶段组织）：项目 × 角度补齐、题池 = 抽样主题（没写的只在不够预算时补）、
 * 场景题数按节奏、JD 证据逐字、简历假设挂项目并兜底、档位。
 */

const jobDescription = "1、负责社交与通讯产品的后端开发；2、参与 API 设计与自动化测试；3、将智能对话能力融入产品。2027 届本科及以上。";

const blueprint: MockInterviewJobBlueprint = {
  summary: "全栈实习",
  completeness: "complete",
  missingInformation: [],
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

const topic = (name: string, fromResume = false): SkillTopic => ({ skill: "backend", name, ladder: `${name}是什么 → 为什么 → 出问题怎么查`, example: `${name}里最容易出错的一步是什么？为什么？`, redFlags: "只会背", signals: "说得出边界", optional: false, fromResume });
const topics = [topic("缓存一致性", true), topic("MySQL 索引"), topic("消息队列可靠投递")];

const projectOut = (projectId: string, angle: BriefOutput["projects"][number]["angle"], question = "你负责哪一段？"): BriefOutput["projects"][number] => ({ projectId, angle, question, leads: ["边界"], expectedSignals: ["职责"] });
const quickOut = (name: string): BriefOutput["quick"][number] => ({ topic: name, question: `${name}怎么保证？`, followUp: "边界条件", expectedSignals: ["机制"] });
const scenarioOut = (overrides: Partial<BriefOutput["scenarios"][number]> = {}): BriefOutput["scenarios"][number] => ({
  name: "场景：接口限流",
  competencyIds: ["api", "ghost"],
  jdEvidence: "参与 API 设计与自动化测试",
  question: "接口被刷了你先做什么？",
  guides: ["一", "二", "三"],
  expectedSignals: ["有顺序"],
  ...overrides,
});

function build(output: Partial<BriefOutput>, extra: { pace?: "quick" | "standard" | "deep"; projects?: typeof projects; topics?: SkillTopic[] } = {}) {
  return buildBriefFromOutput({
    output: { level: "campus", projects: [], quick: [], scenarios: [], hypotheses: [], ...output },
    blueprint,
    jobDescription,
    resumeText,
    projects: extra.projects ?? projects,
    topics: extra.topics ?? topics,
    skillPacks: ["backend"],
    pace: extra.pace ?? "standard",
    round: null,
    askIntro: true,
  });
}

const projectAreas = (brief: ReturnType<typeof build>) => brief.areas.filter((area) => area.kind === "project");

test("项目 × 角度：模型先写到的项目是主项目走五个角度，第二个项目两个角度，没写的角度用兜底问法补齐，不存在的项目丢弃", () => {
  const brief = build({ projects: [projectOut("p2", "overview", "先讲讲二手平台？"), projectOut("p9", "module"), projectOut("p1", "module", "主循环怎么做的？")] });
  const kept = projectAreas(brief);
  assert.deepEqual(
    kept.map((area) => [area.id, area.projectId, area.angle]),
    [...PROJECT_ANGLE_ORDER.map((angle) => [`p1-${angle}`, "p2", angle]), ...ANGLES_BY_RANK[1].map((angle) => [`p2-${angle}`, "p1", angle])],
  );
  assert.equal(kept[0].entryQuestion, "先讲讲二手平台？");
  assert.deepEqual(kept[0].guides, ["边界"]);
  assert.match(kept[1].entryQuestion, /校园二手平台.*模块/);
  assert.ok(kept[1].guides.length > 0, "兜底角度带通用线索");
  assert.equal(kept[6].entryQuestion, "主循环怎么做的？");
  assert.equal(kept[0].name, "校园二手平台：背景与架构");
  assert.deepEqual(kept[0].rubric.map((item) => item.name), ["事实与细节", "岗位关联", "复盘与表达"]);
  assert.equal(probeLimitFor(kept[1]), 3, "模块深挖追 3 层");
  assert.equal(probeLimitFor(kept[0]), 2, "其余角度追 2 层");
  // 模型一个都没给：按简历顺序，主项目五段、第二项目两段。
  assert.equal(projectAreas(build({})).length, 7);
  // 简历只有一个项目：五段；没有项目：无。
  assert.equal(projectAreas(build({}, { projects: [projects[0]] })).length, 5);
  assert.equal(projectAreas(build({}, { projects: [] })).length, 0);
});

test("题池就是抽样的主题：模型写了的按抽样顺序入池，没写的只在不够预算加余量时用包里的好题补；抽样之外的丢弃；简历碰过的带标记", () => {
  const brief = build({ quick: [quickOut("MySQL 索引"), quickOut("Redis 分布式锁")] });
  const pool = brief.areas.filter((area) => area.kind === "quick");
  assert.deepEqual(pool.map((area) => [area.id, area.name]), [["q1", "缓存一致性"], ["q2", "MySQL 索引"], ["q3", "消息队列可靠投递"]]);
  assert.equal(pool[1].entryQuestion, "MySQL 索引怎么保证？");
  assert.equal(pool[0].entryQuestion, "缓存一致性里最容易出错的一步是什么？");
  assert.deepEqual(pool[0].topic, { skill: "backend", name: "缓存一致性", fromResume: true });
  assert.deepEqual(pool[0].rubric.map((item) => item.name), ["准确性", "原理深度", "表达结构"]);
  // 题池已经够"预算 + 余量"（quick 节奏 4 + 2）：模型没写的主题（比如与场景题撞了）不再补；不够时按抽样顺序补。
  const eight = ["A", "B", "C", "D", "E", "F", "G", "H"].map((name) => topic(name));
  const trimmed = build({ quick: ["A", "C", "D", "F", "G", "H"].map(quickOut) }, { pace: "quick", topics: eight });
  assert.deepEqual(trimmed.areas.filter((area) => area.kind === "quick").map((area) => area.name), ["A", "C", "D", "F", "G", "H"]);
  const padded = build({ quick: ["A", "C", "D", "F"].map(quickOut) }, { pace: "quick", topics: eight });
  assert.deepEqual(padded.areas.filter((area) => area.kind === "quick").map((area) => area.name), ["A", "B", "C", "D", "E", "F"]);
});

test("场景题按节奏取数，JD 原句必须逐字、能力 id 必须在蓝图里，不够时代码兜底", () => {
  const brief = build({ scenarios: [scenarioOut(), scenarioOut({ name: "多余的" })] });
  const scenarios = brief.areas.filter((area) => area.kind === "scenario");
  assert.equal(scenarios.length, PACE_PLAN.standard.scenarios);
  assert.deepEqual(scenarios[0].competencyIds, ["api"]);
  assert.equal(scenarios[0].jdEvidence, "参与 API 设计与自动化测试");
  const rewritten = build({ scenarios: [scenarioOut({ jdEvidence: "把 API 做好（改写）" })] });
  assert.equal(rewritten.areas.find((area) => area.kind === "scenario")?.jdEvidence, null);
  const deep = build({}, { pace: "deep" });
  assert.equal(deep.areas.filter((area) => area.kind === "scenario").length, PACE_PLAN.deep.scenarios);
  assert.ok(deep.areas.find((area) => area.kind === "scenario")?.entryQuestion.includes("对外接口"), "兜底场景题落在蓝图核心能力上");
  // 顺序：项目 → 题池 → 场景。
  assert.deepEqual([...new Set(brief.areas.map((area) => area.kind))], ["project", "quick", "scenario"]);
});

test("简历假设：证据逐字、按 projectId 或简历段落挂到项目；没有假设的项目从简历里兜底一条", () => {
  const brief = build({
    projects: [projectOut("p1", "overview"), projectOut("p2", "overview")],
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

test("兜底简报、档位与预算：各阶段预算按节奏，题池至少 8 道，预计回合 = 开场 + 各阶段之和", () => {
  const brief = fallbackBrief({ blueprint, jobDescription, resumeText, projects, topics, skillPacks: ["backend"], pace: "quick", round: null, askIntro: true });
  assert.equal(brief.source, "fallback");
  assert.deepEqual(brief.plan, PACE_PLAN.quick.budget);
  assert.equal(brief.level, "campus", "JD 写了届别按校招");
  assert.equal(projectAreas(brief).length, 7);
  assert.equal(brief.areas.filter((area) => area.kind === "scenario").length, 1);
  assert.equal(plannedTurns(brief), 1 + 6 + 4 + 2);
  assert.equal(poolSizeFor("quick"), 8);
  assert.equal(poolSizeFor("standard"), 12);
  assert.equal(poolSizeFor("deep"), 16);
  assert.equal(guessLevel("负责后端开发，3 年以上经验", "五年 Java 开发经验"), "experienced");
  assert.equal(build({ level: "experienced" }).level, "experienced", "模型判断的档位直接用");
});

test("只读 v7 简报：旧的按切入点或领域清单组织的简报视为没有简报", () => {
  const brief = build({});
  assert.deepEqual(parseStoredBrief(JSON.stringify(brief)), brief);
  assert.equal(parseStoredBrief(JSON.stringify({ ...brief, version: 6, level: undefined })), null);
  assert.equal(parseStoredBrief(JSON.stringify({ version: 5, pace: "standard", areas: [{ id: "a1", kind: "technical", depth: 2 }] })), null);
  assert.equal(parseStoredBrief("not json"), null);
});
