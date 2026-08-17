import type {
  EvidenceConfidenceLabel,
  ProfileDimension,
  ProfileLevelLabel,
  ProfileSourceType,
  ProfileTrend,
} from "./types";

export const PROFILE_SOURCE_WEIGHTS: Record<ProfileSourceType, number> = {
  real_audio: 1,
  real_transcript: 0.9,
  real_summary: 0.75,
  mock_text: 0.5,
};

export const PROFILE_HALF_LIFE_DAYS = 180;
export const PROFILE_TREND_THRESHOLD = 0.25;

export type AggregationObservation = {
  interviewId: string;
  interviewDate: Date;
  dimension: ProfileDimension;
  score: number;
  modelConfidence: number;
  sourceType: ProfileSourceType;
  status?: "active" | "excluded";
};

export type AggregatedProfileMetric = {
  dimension: ProfileDimension;
  level: number | null;
  levelLabel: ProfileLevelLabel;
  trend: ProfileTrend;
  evidenceConfidence: number;
  confidenceLabel: EvidenceConfidenceLabel;
  interviewCount: number;
  realInterviewCount: number;
  evidenceCount: number;
  points: Array<{ interviewId: string; date: string; score: number }>;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function profileSourceWeight(sourceType: ProfileSourceType): number {
  return PROFILE_SOURCE_WEIGHTS[sourceType];
}

/** Compatibility helper used by older callers. */
export function profileEvidenceWeight(sourceKind: "real" | "mock"): number {
  return sourceKind === "mock"
    ? PROFILE_SOURCE_WEIGHTS.mock_text
    : PROFILE_SOURCE_WEIGHTS.real_audio;
}

export function timeDecayWeight(date: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
  return 0.5 ** (ageDays / PROFILE_HALF_LIFE_DAYS);
}

/** 面试少于此数的结论一律标注"初步印象"，而不是干脆不给。 */
export const PROFILE_TENTATIVE_INTERVIEW_COUNT = 3;

export function isTentativeProfileMetric(interviewCount: number): boolean {
  return interviewCount < PROFILE_TENTATIVE_INTERVIEW_COUNT;
}

// 门槛下放：有一场面试就给出等级（配合 tentative 标注），
// 冷启动时宁可给"初步印象"，也不给一排"待积累"空表盘。
export function profileLevelLabel(
  score: number | null,
  interviewCount: number,
): ProfileLevelLabel {
  if (score === null || interviewCount < 1) return "待积累";
  if (score < 2) return "基础";
  if (score < 3) return "稳定";
  if (score < 4) return "熟练";
  return "突出";
}

export function evidenceConfidenceLabel(
  confidence: number,
  interviewCount: number,
): EvidenceConfidenceLabel {
  if (interviewCount < 1) return "待积累";
  if (confidence < 0.45) return "较低";
  if (confidence < 0.72) return "中等";
  return "较高";
}

/** 用户在本地时区面试，按 UTC 分天会把凌晨的面试算进前一天。 */
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function deriveTrend(
  points: Array<{ date: Date; score: number }>,
): ProfileTrend {
  const dates = new Set(points.map((point) => localDayKey(point.date)));
  if (dates.size < 3) return "insufficient";

  const ordered = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = ordered[0].date.getTime();
  const span = Math.max(1, ordered.at(-1)!.date.getTime() - first);
  const coordinates = ordered.map((point) => ({
    x: (point.date.getTime() - first) / span,
    y: point.score,
  }));
  const meanX = coordinates.reduce((sum, point) => sum + point.x, 0) / coordinates.length;
  const meanY = coordinates.reduce((sum, point) => sum + point.y, 0) / coordinates.length;
  const denominator = coordinates.reduce(
    (sum, point) => sum + (point.x - meanX) ** 2,
    0,
  );
  if (denominator === 0) return "stable";
  const estimatedChange =
    coordinates.reduce(
      (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
      0,
    ) / denominator;

  if (estimatedChange >= PROFILE_TREND_THRESHOLD) return "up";
  if (estimatedChange <= -PROFILE_TREND_THRESHOLD) return "down";
  return "stable";
}

export function aggregateProfileDimension(
  dimension: ProfileDimension,
  observations: AggregationObservation[],
  now = new Date(),
): AggregatedProfileMetric {
  const applicable = observations.filter(
    (item) =>
      item.dimension === dimension &&
      item.status !== "excluded" &&
      Number.isFinite(item.score) &&
      item.score >= 1 &&
      item.score <= 5,
  );
  const byInterview = new Map<string, AggregationObservation[]>();
  for (const observation of applicable) {
    const current = byInterview.get(observation.interviewId) ?? [];
    current.push(observation);
    byInterview.set(observation.interviewId, current);
  }

  const points = [...byInterview.entries()].map(([interviewId, items]) => {
    const confidenceTotal = items.reduce(
      (sum, item) => sum + clamp(item.modelConfidence, 0.1, 1),
      0,
    );
    const score = items.reduce(
      (sum, item) => sum + item.score * clamp(item.modelConfidence, 0.1, 1),
      0,
    ) / confidenceTotal;
    const newest = items.reduce((latest, item) =>
      item.interviewDate > latest.interviewDate ? item : latest,
    );
    return {
      interviewId,
      date: newest.interviewDate,
      score,
      sourceType: newest.sourceType,
      sourceWeight: profileSourceWeight(newest.sourceType),
    };
  });

  const weighted = points.map((point) => ({
    ...point,
    weight: point.sourceWeight * timeDecayWeight(point.date, now),
  }));
  const weightTotal = weighted.reduce((sum, point) => sum + point.weight, 0);
  const level = weightTotal
    ? weighted.reduce((sum, point) => sum + point.score * point.weight, 0) /
      weightTotal
    : null;
  const interviewCount = points.length;
  const realInterviewCount = points.filter((point) =>
    point.sourceType.startsWith("real_"),
  ).length;
  const countCoverage = 1 - Math.exp(-interviewCount / 3);
  const realCoverage = interviewCount ? realInterviewCount / interviewCount : 0;
  const sourceQuality = interviewCount
    ? points.reduce((sum, point) => sum + point.sourceWeight, 0) / interviewCount
    : 0;
  const freshness = interviewCount
    ? points.reduce((sum, point) => sum + timeDecayWeight(point.date, now), 0) /
      interviewCount
    : 0;
  const evidenceConfidence = clamp(
    0.35 * countCoverage +
      0.25 * realCoverage +
      0.2 * sourceQuality +
      0.2 * freshness,
  );

  return {
    dimension,
    level,
    levelLabel: profileLevelLabel(level, interviewCount),
    trend: deriveTrend(points),
    evidenceConfidence,
    confidenceLabel: evidenceConfidenceLabel(evidenceConfidence, interviewCount),
    interviewCount,
    realInterviewCount,
    evidenceCount: applicable.length,
    points: points
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((point) => ({
        interviewId: point.interviewId,
        date: point.date.toISOString(),
        score: point.score,
      })),
  };
}

export function deriveInsightStatus(input: {
  isUserLocked: boolean;
  confidence: number;
  supportingInterviewIds: Iterable<string>;
}): "active" | "tentative" {
  if (input.isUserLocked) return "active";
  return new Set(input.supportingInterviewIds).size >= 2 && input.confidence >= 0.7
    ? "active"
    : "tentative";
}
