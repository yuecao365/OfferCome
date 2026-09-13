import assert from "node:assert/strict";
import test from "node:test";

import { buildQuestionTeaching } from "./teaching";

test("buildQuestionTeaching reads the segment metadata written at thread close", () => {
  const teaching = buildQuestionTeaching({
    metadata: {
      areaId: "a1",
      areaName: "MySQL 索引",
      areaKind: "quick",
      competencyOrigin: "baseline",
      skillPack: "backend",
      note: "机制清楚，取舍偏弱",
      depth: 2,
      probeCount: 2,
      hinted: false,
      verdict: null,
      answerSeconds: 95,
    },
    expectedSignals: ["说明取舍", "给出验证方式"],
    sourceKind: "quick",
  });

  assert.deepEqual(teaching, {
    areaName: "MySQL 索引",
    competencyOrigin: "baseline",
    skillPack: "backend",
    answerSeconds: 95,
    expectedSignals: ["说明取舍", "给出验证方式"],
    note: "机制清楚，取舍偏弱",
    sourceKind: "quick",
  });
});

test("buildQuestionTeaching degrades safely when stored data is malformed", () => {
  const teaching = buildQuestionTeaching({ metadata: "not-json", expectedSignals: {}, sourceKind: "quick" });
  assert.equal(teaching.areaName, null);
  assert.deepEqual(teaching.expectedSignals, []);
  assert.equal(teaching.note, null);
});
