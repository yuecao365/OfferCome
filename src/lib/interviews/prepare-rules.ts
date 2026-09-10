import { PROFILE_DIMENSION_LABELS, type ProfileDimension } from "@/lib/candidate-profile/types";

/**
 * 真实面试备战页的纯口径：同一家公司的历史题最多几组、弱项取几个、少于几场不下结论。
 * 本地版从库取数（prepare.ts），体验版从浏览器工作台取数（trial/workspace-prepare.ts），规则只在这里。
 */

/** 备战页最多展示的历史问题组数，够看又不至于淹没重点。 */
export const COMPANY_QUESTION_LIMIT = 10;
/** 弱项维度展示数量。 */
export const WEAK_DIMENSION_LIMIT = 2;
/** 与画像一致：不足两场有效面试的维度不下结论。 */
export const MIN_INTERVIEWS_FOR_METRIC = 2;

export type PrepareWeakDimension = {
  dimension: ProfileDimension;
  label: string;
  levelLabel: string;
  insightTitles: string[];
};

/** 从一个视角的指标里挑最弱的几维，配上该维度的弱项 / 训练洞察标题。 */
export function pickWeakDimensions(
  metrics: { dimension: ProfileDimension; level: number | null; levelLabel: string; interviewCount: number }[],
  insights: { dimension: string; title: string }[],
): PrepareWeakDimension[] {
  return metrics
    .filter((metric) => metric.interviewCount >= MIN_INTERVIEWS_FOR_METRIC && metric.level !== null)
    .toSorted((left, right) => (left.level ?? 0) - (right.level ?? 0))
    .slice(0, WEAK_DIMENSION_LIMIT)
    .map((metric) => ({
      dimension: metric.dimension,
      label: PROFILE_DIMENSION_LABELS[metric.dimension],
      levelLabel: metric.levelLabel,
      insightTitles: insights
        .filter((insight) => insight.dimension === metric.dimension)
        .map((insight) => insight.title)
        .slice(0, 2),
    }));
}
