import assert from "node:assert/strict";
import test from "node:test";

import {
  parseQuestionEvaluationInput,
  validateQuestionEvaluation,
} from "./question-evaluation";

test("parses only valid rubric and expected signal inputs", () => {
  const parsed = parseQuestionEvaluationInput({
    rubric: [{ name: "技术正确性", description: "准确", weight: 60 }],
    expectedSignals: ["说明边界"],
  });
  assert.equal(parsed.rubric.length, 1);
  assert.deepEqual(parsed.expectedSignals, ["说明边界"]);
});

test("keeps only unique dimensions defined by the persisted rubric", () => {
  const result = validateQuestionEvaluation(
    {
      dimensions: [
        { name: "技术正确性", score: 80, evidence: "解释了边界" },
        { name: "不存在的维度", score: 100, evidence: "模型臆造" },
        { name: "技术正确性", score: 90, evidence: "重复" },
      ],
      strengths: [],
      improvements: [],
      feedback: "回答基本完整。",
    },
    [{ name: "技术正确性" }],
  );
  assert.deepEqual(result.dimensions.map((item) => item.name), ["技术正确性"]);
});
