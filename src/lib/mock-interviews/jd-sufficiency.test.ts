import assert from "node:assert/strict";
import test from "node:test";

import { needsJobDescriptionReview } from "./jd-sufficiency";
import type { MockInterviewJobBlueprint } from "./types";

function blueprint(
  completeness: MockInterviewJobBlueprint["completeness"],
  competencyCount: number,
): MockInterviewJobBlueprint {
  return {
    summary: "测试岗位",
    completeness,
    missingInformation: [],
    competencies: Array.from({ length: competencyCount }, (_, index) => ({
      id: `competency-${index}`,
      name: `能力 ${index}`,
      description: "岗位能力",
      priority: "core" as const,
      jdEvidence: `岗位要求 ${index}`,
      origin: "jd" as const,
      sourceUrl: null,
    })),
  };
}

test("requires review for minimal job descriptions", () => {
  assert.equal(needsJobDescriptionReview(blueprint("minimal", 6), 8), true);
});

test("requires review for partial descriptions with fewer than four competencies", () => {
  assert.equal(needsJobDescriptionReview(blueprint("partial", 3), 5), true);
  assert.equal(needsJobDescriptionReview(blueprint("partial", 4), 5), false);
});

test("requires enough competencies for the requested question count", () => {
  assert.equal(needsJobDescriptionReview(blueprint("complete", 3), 8), true);
  assert.equal(needsJobDescriptionReview(blueprint("complete", 4), 8), false);
});
