import type { MockInterviewJobBlueprint } from "./types";

const MIN_PARTIAL_COMPETENCY_COUNT = 4;

/**
 * JD 长度低于此值时连"AI 补全"都缺乏素材，才值得暂停问用户；
 * 高于此值的偏薄 JD 直接自动补全继续，不打断流程。
 */
export const MIN_JD_CHARS_FOR_AUTO_ENRICH = 80;

function requiredCompetencyCount(questionCount: number): number {
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
