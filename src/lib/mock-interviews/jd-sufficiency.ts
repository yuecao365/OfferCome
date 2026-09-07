import type { MockInterviewJobBlueprint } from "./types";

const MIN_PARTIAL_COMPETENCY_COUNT = 4;

/**
 * JD 长度低于此值时连"AI 补全"都缺乏素材，才值得暂停问用户；
 * 高于此值的偏薄 JD 直接自动补全继续，不打断流程。
 */
export const MIN_JD_CHARS_FOR_AUTO_ENRICH = 80;

/** 面试越长要覆盖的领域越多：每 10 分钟至少一条能力，最少 2 条。 */
export function requiredCompetenciesForDuration(durationMinutes: number): number {
  return Math.max(2, Math.ceil(durationMinutes / 10));
}

export function needsJobDescriptionReview(
  blueprint: MockInterviewJobBlueprint,
  minCompetencies: number,
): boolean {
  const competencyCount = blueprint.competencies.length;
  return (
    blueprint.completeness === "minimal" ||
    (blueprint.completeness === "partial" &&
      competencyCount < MIN_PARTIAL_COMPETENCY_COUNT) ||
    competencyCount < minCompetencies
  );
}
