import assert from "node:assert/strict";
import test from "node:test";

import { createQuestionOutputSchema } from "./generation-schema";

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

test("keeps exact count validation out of the provider JSON Schema", async () => {
  const schema = createQuestionOutputSchema(3);
  const json = await schema.jsonSchema;
  const questions = (
    json.properties?.questions as { minItems?: number; maxItems?: number }
  );

  assert.equal(questions.minItems, undefined);
  assert.equal(questions.maxItems, undefined);
  const invalid = await schema.validate?.({ questions: [validQuestion, validQuestion] });
  const valid = await schema.validate?.({
    questions: [validQuestion, validQuestion, validQuestion],
  });
  assert.equal(invalid?.success, false);
  assert.equal(
    valid?.success,
    true,
  );
});
