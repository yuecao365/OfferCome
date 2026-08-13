import assert from "node:assert/strict";
import test from "node:test";

import { buildQuestionTeaching } from "./teaching";

const evaluation = {
  expectedSignalsJson: JSON.stringify(["说明取舍", "给出验证方式"]),
  generationMetadataJson: JSON.stringify({
    jobCompetencyId: "system_design",
    jdEvidence: "负责高并发系统设计",
    rationale: "验证候选人的架构判断",
  }),
  sourceKind: "job_description",
  difficulty: "standard",
};

test("buildQuestionTeaching resolves competency and persisted generation evidence", () => {
  const teaching = buildQuestionTeaching(
    JSON.stringify({
      jobBlueprint: {
        competencies: [{ id: "system_design", name: "系统设计" }],
      },
    }),
    evaluation,
  );

  assert.deepEqual(teaching, {
    competencyName: "系统设计",
    competencyOrigin: "jd",
    sourceUrl: null,
    jdEvidence: "负责高并发系统设计",
    expectedSignals: ["说明取舍", "给出验证方式"],
    rationale: "验证候选人的架构判断",
    sourceKind: "job_description",
    difficulty: "standard",
  });
});

test("buildQuestionTeaching degrades safely when snapshot data is malformed", () => {
  const teaching = buildQuestionTeaching("not-json", {
    ...evaluation,
    expectedSignalsJson: "{}",
    generationMetadataJson: "not-json",
  });

  assert.equal(teaching.competencyName, null);
  assert.equal(teaching.jdEvidence, null);
  assert.deepEqual(teaching.expectedSignals, []);
  assert.equal(teaching.rationale, null);
});
