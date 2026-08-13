import assert from "node:assert/strict";
import test from "node:test";

import {
  detectInsightConflict,
  INSIGHT_SCORE_RANGE_CONFLICT_THRESHOLD,
} from "./conflict";

test("does not flag purely supporting evidence with stable scores", () => {
  assert.equal(
    detectInsightConflict({
      evidence: [{ polarity: "supports" }, { polarity: "supports" }],
      interviewScores: [
        { interviewId: "first", score: 4.2 },
        { interviewId: "second", score: 3.8 },
      ],
    }),
    false,
  );
});

test("flags mixed supporting and contradicting evidence", () => {
  assert.equal(
    detectInsightConflict({
      evidence: [{ polarity: "supports" }, { polarity: "contradicts" }],
      interviewScores: [],
    }),
    true,
  );
});

test("flags score ranges at the named threshold", () => {
  assert.equal(
    detectInsightConflict({
      evidence: [{ polarity: "supports" }],
      interviewScores: [
        { interviewId: "first", score: 4.5 },
        {
          interviewId: "second",
          score: 4.5 - INSIGHT_SCORE_RANGE_CONFLICT_THRESHOLD,
        },
      ],
    }),
    true,
  );
});

test("does not flag a single interview even when it has multiple score entries", () => {
  assert.equal(
    detectInsightConflict({
      evidence: [{ polarity: "supports" }],
      interviewScores: [
        { interviewId: "only", score: 4.8 },
        { interviewId: "only", score: 1.2 },
      ],
    }),
    false,
  );
});
