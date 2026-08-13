import type { MockInterviewJobBlueprint } from "./types";

export const MIN_PARTIAL_COMPETENCY_COUNT = 4;

export function requiredCompetencyCount(questionCount: number): number {
  return Math.ceil(questionCount / 2);
}

export function needsJobDescriptionReview(
  blueprint: MockInterviewJobBlueprint,
  questionCount: number,
): boolean {
  const competencyCount = blueprint.competencies.length;
  return (
    blueprint.completeness === "minimal" ||
    (blueprint.completeness === "partial" &&
      competencyCount < MIN_PARTIAL_COMPETENCY_COUNT) ||
    competencyCount < requiredCompetencyCount(questionCount)
  );
}
