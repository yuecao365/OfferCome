import assert from "node:assert/strict";
import test from "node:test";

import { computeInterviewTotalScore, computeQuestionScore } from "./scoring";

test("computes a normalized weighted score even when rubric weights do not sum to 100", () => {
  assert.equal(
    computeQuestionScore(
      [
        { name: "正确性", weight: 3 },
        { name: "表达", weight: 1 },
      ],
      [
        { name: "正确性", score: 80 },
        { name: "表达", score: 40 },
      ],
    ),
    70,
  );
});

test("treats missing dimensions and invalid rubrics safely", () => {
  assert.equal(
    computeQuestionScore([{ name: "正确性", weight: 100 }], []),
    0,
  );
  assert.equal(computeQuestionScore([], [{ name: "正确性", score: 90 }]), 0);
});

test("counts skipped questions as zero in the interview total", () => {
  assert.equal(computeInterviewTotalScore([80, 0, 70]), 50);
  assert.equal(computeInterviewTotalScore([0, 0]), 0);
});
