export const INSIGHT_SCORE_RANGE_CONFLICT_THRESHOLD = 1.5;

type InsightEvidencePolarity = "supports" | "contradicts";

export function detectInsightConflict(input: {
  evidence: Array<{ polarity: InsightEvidencePolarity }>;
  interviewScores: Array<{ interviewId: string; score: number }>;
}): boolean {
  const polarities = new Set(input.evidence.map((item) => item.polarity));
  if (polarities.has("supports") && polarities.has("contradicts")) {
    return true;
  }

  const scoresByInterview = new Map(
    input.interviewScores
      .filter((item) => Number.isFinite(item.score))
      .map((item) => [item.interviewId, item.score]),
  );
  if (scoresByInterview.size < 2) return false;

  const scores = [...scoresByInterview.values()];
  return (
    Math.max(...scores) - Math.min(...scores) >=
    INSIGHT_SCORE_RANGE_CONFLICT_THRESHOLD
  );
}
