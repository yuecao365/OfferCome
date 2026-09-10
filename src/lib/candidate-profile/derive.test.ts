import assert from "node:assert/strict";
import test from "node:test";

import { PROFILE_DIMENSION_BY_RUBRIC, rubricForArea } from "@/lib/mock-interviews/interviewer/brief";

import { deriveObservationsFromEvaluation, profileLevelForScore } from "./derive";

test("every rubric dimension has a profile mapping", () => {
  const names = [
    ...rubricForArea("technical", "scenario"),
    ...rubricForArea("technical", "fundamentals"),
    ...rubricForArea("project", null),
    ...rubricForArea("behavioral", null),
  ].map((item) => item.name);
  for (const name of names) assert.ok(name in PROFILE_DIMENSION_BY_RUBRIC, `${name} 没有画像归属`);
});

test("score bands line up with the evaluation prompt", () => {
  assert.equal(profileLevelForScore(95), 5);
  assert.equal(profileLevelForScore(90), 5);
  assert.equal(profileLevelForScore(85), 4);
  assert.equal(profileLevelForScore(70), 3);
  assert.equal(profileLevelForScore(69), 2);
  assert.equal(profileLevelForScore(49), 1);
});

const answer = "队列满了才会去创建非核心线程。到了核心数以后先把任务塞进 workQueue，offer 成功就结束了。";

test("keeps only the evidence sentences that really appear in the answer", () => {
  const [observation] = deriveObservationsFromEvaluation({
    questionId: "q1",
    answer,
    dimensions: [
      { name: "准确性", score: 88, evidence: "“队列满了才会去创建非核心线程。” / “这句是模型编的”", gap: "略绝对" },
    ],
  });
  assert.equal(observation?.dimension, "knowledge_accuracy");
  assert.equal(observation?.score, 4);
  assert.equal(observation?.evidenceExcerpt, "队列满了才会去创建非核心线程。");
  assert.equal(observation?.confidence, 0.9);
});

test("falls back to the gap when no quote survives, and skips dimensions with neither", () => {
  const observations = deriveObservationsFromEvaluation({
    questionId: "q1",
    answer,
    dimensions: [
      { name: "原理深度", score: 60, evidence: "改写过的引用", gap: "没有讲为什么大队列会掩盖问题" },
      { name: "表达结构", score: 80, evidence: "改写过的引用", gap: null },
      { name: "岗位关联", score: 90, evidence: "队列满了才会去创建非核心线程。", gap: null },
    ],
  });
  assert.deepEqual(
    observations.map((item) => [item.dimension, item.score, item.confidence, item.evidenceExcerpt]),
    [["reasoning_depth", 2, 0.6, "缺口：没有讲为什么大队列会掩盖问题"]],
  );
});
