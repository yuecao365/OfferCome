import assert from "node:assert/strict";
import test from "node:test";

import type { InterviewArea, InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { testBrief } from "@/lib/test-support/interview-brief";

import {
  briefCoverageText,
  coverageRates,
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

function brief(areas: Partial<InterviewArea>[]): InterviewBrief {
  return testBrief({
    pace: "quick",
    areas: areas.map((area, index) => ({
      id: `A${index + 1}`,
      kind: "quick",
      name: `领域${index + 1}`,
      projectId: null,
      angle: null,
      competencyIds: [],
      jdEvidence: null,
      anchor: null,
      skill: null,
      entryQuestion: "切入",
      guides: ["一", "二"],
      expectedSignals: ["信号"],
      rubric: [],
      ...area,
    })),
  });
}

test("briefCoverageText includes project areas and keeps follow-ups readable", () => {
  const text = briefCoverageText(brief([{ name: "缓存一致性", kind: "quick" }, { name: "项目深挖", kind: "project" }]));
  assert.ok(text.includes("【缓存一致性】"));
  assert.ok(text.includes("【项目深挖】"));
  assert.ok(text.includes("追问：1. 一；2. 二"));
});

test("coverageRates weights by mianjing frequency and ignores unjudged topics", () => {
  const rates = coverageRates(topics, { "redis-lock": true, "mysql-index": false, mq: null });
  assert.deepEqual(rates.weighted, { value: 0.6, numerator: 6, denominator: 10 });
  assert.deepEqual(rates.plain, { value: 0.5, numerator: 1, denominator: 2 });
});

test("summarizeRoleCoverage merges briefs and lists the most-missed topics", () => {
  const briefs: BriefCoverage[] = [
    { role: "backend", jd: "a", rep: 1, covered: { "redis-lock": true, "mysql-index": false, mq: false }, areaCount: 3, anchoredCount: 1, skillPacks: ["backend"] },
    { role: "backend", jd: "b", rep: 1, covered: { "redis-lock": true, "mysql-index": true, mq: false }, areaCount: 2, anchoredCount: 0, skillPacks: [] },
  ];
  const metrics = summarizeRoleCoverage("backend", topics, briefs);
  assert.deepEqual(metrics.weightedCoverage, { value: 16 / 24, numerator: 16, denominator: 24 });
  assert.deepEqual(metrics.plainCoverage, { value: 0.5, numerator: 3, denominator: 6 });
  assert.deepEqual(metrics.anchoredShare, { value: 0.2, numerator: 1, denominator: 5 });
  assert.deepEqual(metrics.missed.map((topic) => topic.id), ["mq", "mysql-index"]);
});

test("eval/coverage.json names two existing JDs and a same-direction resume per role", () => {
  const config = loadCoverageConfig();
  const ids = new Set(loadJdFixtures().map((jd) => jd.id));
  for (const [role, entry] of Object.entries(config.roles)) {
    assert.equal(entry.jds.length, 2, `${role} 应有 2 份 JD`);
    for (const id of entry.jds) assert.ok(ids.has(id), `${role} 引用了不存在的 JD ${id}`);
    assert.equal(entry.resume, `synthetic-${role}`, `${role} 的简历要与岗位同向`);
  }
});
