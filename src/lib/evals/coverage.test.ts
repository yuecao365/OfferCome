import assert from "node:assert/strict";
import test from "node:test";

import type { InterviewBrief } from "@/lib/mock-interviews/interviewer/brief";

import {
  briefCoverageText,
  briefLadderRate,
  coverageRates,
  ladderProgresses,
  loadCoverageConfig,
  summarizeRoleCoverage,
  type BriefCoverage,
  type Topic,
} from "./coverage";
import { loadJdFixtures } from "./fixtures";

const topics: Topic[] = [
  { id: "redis-lock", name: "Redis 分布式锁", description: "…", count: 6, examples: ["如何用 Redis 实现分布式锁"] },
  { id: "mysql-index", name: "MySQL 索引", description: "…", count: 4, examples: ["为什么用 B+ 树"] },
  { id: "mq", name: "消息队列可靠投递", description: "…", count: 2, examples: ["消息丢失怎么办"] },
];

function brief(areas: Partial<InterviewBrief["areas"][number]>[]): InterviewBrief {
  return {
    version: 4,
    pace: "quick",
    plannedTurns: 6,
    round: null,
    askIntro: true,
    areas: areas.map((area, index) => ({
      id: `A${index + 1}`,
      name: `领域${index + 1}`,
      kind: "technical",
      style: "scenario",
      description: "描述",
      competencyIds: [],
      baseline: null,
      weight: 2,
      depth: 2,
      entryQuestion: "切入",
      ladder: [{ text: "一", style: "fact" }, { text: "二", style: "principle" }],
      expectedSignals: ["信号"],
      rubric: [],
      ...area,
    })),
    hypotheses: [],
    skillPacks: [],
    source: "model",
  };
}

test("ladderProgresses checks fact → principle → scenario / tradeoff order and skips unlabeled rungs", () => {
  assert.equal(ladderProgresses([{ style: "fact" }, { style: "principle" }, { style: "tradeoff" }]), true);
  assert.equal(ladderProgresses([{ style: "fact" }, { style: null }, { style: "scenario" }]), true);
  assert.equal(ladderProgresses([{ style: "scenario" }, { style: "fact" }]), false);
  assert.equal(ladderProgresses([{ style: "fact" }]), null);
  assert.equal(ladderProgresses([{ style: null }, { style: null }]), null);
});

test("briefCoverageText leaves project areas out and keeps ladders readable", () => {
  const text = briefCoverageText(brief([{ name: "缓存一致性", kind: "technical" }, { name: "项目深挖", kind: "project" }]));
  assert.ok(text.includes("【缓存一致性】"));
  assert.ok(!text.includes("项目深挖"));
  assert.ok(text.includes("追问阶梯：1. 一；2. 二"));
});

test("coverageRates weights by mianjing frequency and ignores unjudged topics", () => {
  const rates = coverageRates(topics, { "redis-lock": true, "mysql-index": false, mq: null });
  assert.deepEqual(rates.weighted, { value: 0.6, numerator: 6, denominator: 10 });
  assert.deepEqual(rates.plain, { value: 0.5, numerator: 1, denominator: 2 });
});

test("summarizeRoleCoverage merges briefs and lists the most-missed topics", () => {
  const briefs: BriefCoverage[] = [
    { role: "backend", jd: "a", rep: 1, covered: { "redis-lock": true, "mysql-index": false, mq: false }, ladderProgressRate: { value: 1, numerator: 2, denominator: 2 }, areaCount: 3, baselineAreaCount: 1 },
    { role: "backend", jd: "b", rep: 1, covered: { "redis-lock": true, "mysql-index": true, mq: false }, ladderProgressRate: { value: 0.5, numerator: 1, denominator: 2 }, areaCount: 2, baselineAreaCount: 0 },
  ];
  const metrics = summarizeRoleCoverage("backend", topics, briefs);
  assert.deepEqual(metrics.weightedCoverage, { value: 16 / 24, numerator: 16, denominator: 24 });
  assert.deepEqual(metrics.plainCoverage, { value: 0.5, numerator: 3, denominator: 6 });
  assert.deepEqual(metrics.ladderProgressRate, { value: 0.75, numerator: 3, denominator: 4 });
  assert.deepEqual(metrics.baselineAreaShare, { value: 0.2, numerator: 1, denominator: 5 });
  assert.deepEqual(metrics.missed.map((topic) => topic.id), ["mq", "mysql-index"]);
  assert.equal(briefLadderRate(brief([{}, { ladder: [{ text: "x", style: "tradeoff" }, { text: "y", style: "fact" }] }])).value, 0.5);
});

test("eval/coverage.json names two existing JDs per role and a known resume", () => {
  const config = loadCoverageConfig();
  const ids = new Set(loadJdFixtures().map((jd) => jd.id));
  for (const [role, jds] of Object.entries(config.roles)) {
    assert.equal(jds.length, 2, `${role} 应有 2 份 JD`);
    for (const id of jds) assert.ok(ids.has(id), `${role} 引用了不存在的 JD ${id}`);
  }
  assert.equal(config.resume, "synthetic-backend");
});
