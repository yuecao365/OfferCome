import assert from "node:assert/strict";
import test from "node:test";

import { createMockInterviewQuestionBatchSchema } from "./types";

const validQuestion = {
  question: "如何设计 Agent Harness？",
  category: "technical" as const,
  difficulty: "standard" as const,
  sourceKind: "job_description" as const,
  jobCompetencyId: "agent_harness",
  jdEvidence: "搭建稳定、高效 Agent Harness",
  relevanceScore: 0.9,
  resumeProjectId: null,
  personalizationSourceId: null,
  rationale: "岗位核心职责",
  expectedSignals: ["运行时", "验证"],
};

test("requires the exact requested question count", () => {
  const schema = createMockInterviewQuestionBatchSchema(3);
  assert.equal(
    schema.safeParse({ questions: [validQuestion, validQuestion, validQuestion] }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ questions: [validQuestion, validQuestion] }).success,
    false,
  );
});
