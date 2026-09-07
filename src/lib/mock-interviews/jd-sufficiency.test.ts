import assert from "node:assert/strict";
import test from "node:test";

import { needsJobDescriptionReview, requiredCompetenciesForDuration } from "./jd-sufficiency";
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
  assert.equal(needsJobDescriptionReview(blueprint("minimal", 6), 3), true);
});

test("requires review for partial descriptions with fewer than four competencies", () => {
  assert.equal(needsJobDescriptionReview(blueprint("partial", 3), 3), true);
  assert.equal(needsJobDescriptionReview(blueprint("partial", 4), 3), false);
});

test("requires enough competencies for the interview length", () => {
  assert.equal(needsJobDescriptionReview(blueprint("complete", 3), 4), true);
  assert.equal(needsJobDescriptionReview(blueprint("complete", 4), 4), false);
});

test("longer interviews demand more competencies, never fewer than two", () => {
  assert.equal(requiredCompetenciesForDuration(15), 2);
  assert.equal(requiredCompetenciesForDuration(30), 3);
  assert.equal(requiredCompetenciesForDuration(45), 5);
});
