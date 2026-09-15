import assert from "node:assert/strict";
import test from "node:test";

import { coreSettled, correlation, estimate, estimateLine, evidenceOf, nextToProbe, type Competency } from "./estimator";

const competencies: Competency[] = [
  { id: "c1", name: "系统可靠性", priority: "core" },
  { id: "c2", name: "RAG 基础", priority: "core" },
  { id: "c3", name: "协作", priority: "secondary" },
];

test("证据：难度层与分数折成 0–1；越难答得越好证据越强", () => {
  assert.equal(evidenceOf({ competencyId: "c1", difficulty: 1, score: 100, confidence: 1 }), 0.25);
  assert.equal(evidenceOf({ competencyId: "c1", difficulty: 4, score: 100, confidence: 1 }), 1);
  assert.equal(evidenceOf({ competencyId: "c1", difficulty: 2, score: 50, confidence: 1 }), 0.375);
  assert.equal(evidenceOf({ competencyId: "c1", difficulty: 9, score: 200, confidence: 1 }), 1);
});

test("后验：没测过是 0.5 / 置信 0；置信加权更新；三段有效问答后足够确定", () => {
  const none = estimate(competencies, []);
  assert.deepEqual(none.map((item) => [item.mean, item.confidence, item.samples]), [[0.5, 0, 0], [0.5, 0, 0], [0.5, 0, 0]]);
  const some = estimate(competencies, [
    { competencyId: "c1", difficulty: 3, score: 80, confidence: 1 },
    { competencyId: "c1", difficulty: 4, score: 60, confidence: 1 },
    { competencyId: "c1", difficulty: 2, score: 90, confidence: 1 },
    { competencyId: "c2", difficulty: 1, score: 40, confidence: 0.5 },
  ]);
  const c1 = some[0];
  assert.ok(c1.mean > 0.55 && c1.mean < 0.7, String(c1.mean));
  assert.equal(c1.confidence, 0.6);
  assert.equal(c1.samples, 3);
  assert.ok(some[1].confidence < 0.3 && some[1].mean < 0.5);
  assert.equal(coreSettled(some), false);
});

test("下一个最值得追：权重 × 不确定性最大；都定了就停", () => {
  const partial = estimate(competencies, Array.from({ length: 3 }, () => ({ competencyId: "c1", difficulty: 3, score: 80, confidence: 1 })));
  assert.equal(nextToProbe(partial)?.competencyId, "c2");
  const all = estimate(
    competencies,
    ["c1", "c2"].flatMap((id) => Array.from({ length: 3 }, () => ({ competencyId: id, difficulty: 3, score: 80, confidence: 1 }))),
  );
  assert.equal(coreSettled(all), true);
  assert.equal(nextToProbe(all)?.competencyId, "c3");
  assert.equal(estimateLine(all), "能力估计：核心能力都已足够确定，剩下的时间可以收尾。");
});

test("现场卡一行：最值得追 + 已足够确定；没有能力清单为 null", () => {
  assert.equal(estimateLine([]), null);
  const line = estimateLine(estimate(competencies, Array.from({ length: 3 }, () => ({ competencyId: "c2", difficulty: 4, score: 90, confidence: 1 }))));
  assert.equal(line, "能力估计：最值得追：系统可靠性（估计 中，置信 低，岗位权重 高）；已足够确定：RAG 基础（估计 高，置信 中，岗位权重 高）。");
});

test("相关：只算测过的能力；不足两项为 null", () => {
  const estimates = estimate(competencies, [
    { competencyId: "c1", difficulty: 4, score: 90, confidence: 1 },
    { competencyId: "c2", difficulty: 1, score: 30, confidence: 1 },
    { competencyId: "c3", difficulty: 2, score: 60, confidence: 1 },
  ]);
  const truth = [{ competencyId: "c1", level: 0.8 }, { competencyId: "c2", level: 0.2 }, { competencyId: "c3", level: 0.5 }];
  assert.ok((correlation(estimates, truth) ?? 0) > 0.9);
  assert.equal(correlation(estimates.slice(0, 1), truth), null);
});
