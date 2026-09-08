export type RubricItem = { name: string; weight: number };
export type DimensionScore = { name: string; score: number };

export function computeQuestionScore(rubric: unknown[], dimensions: DimensionScore[]): number {
  const scores = new Map(dimensions.map((item) => [item.name, item.score]));
  let weightedScore = 0;
  let totalWeight = 0;
  for (const rawItem of rubric) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name : "";
    const weight = typeof item.weight === "number" ? item.weight : 0;
    if (!name || !Number.isFinite(weight) || weight <= 0) continue;
    const score = scores.get(name) ?? 0;
    weightedScore += Math.min(100, Math.max(0, score)) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
}

/** 一个考察领域在本场的得分：几条线程取最高（回访补问是给机会），跳过的线程记 0。 */
export type AreaScoreInput = { weight: number; scores: number[] };

export function areaScore(area: AreaScoreInput): number {
  return Math.max(0, ...area.scores);
}

/** 总分按领域权重加权；只算问到过的领域（没开线程的不计）。 */
export function computeInterviewTotalScore(areas: AreaScoreInput[]): number {
  const asked = areas.filter((area) => area.scores.length > 0 && area.weight > 0);
  const totalWeight = asked.reduce((sum, area) => sum + area.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(asked.reduce((sum, area) => sum + areaScore(area) * area.weight, 0) / totalWeight);
}
