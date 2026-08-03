export type RubricItem = { name: string; weight: number };
export type DimensionScore = { name: string; score: number };

export function computeQuestionScore(
  rubric: unknown[],
  dimensions: DimensionScore[],
): number {
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
