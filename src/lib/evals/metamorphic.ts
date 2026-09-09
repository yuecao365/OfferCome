import type { MockInterviewQuestionEvaluation } from "@/lib/mock-interviews/question-evaluation";
import { normalizedText } from "@/lib/text/similarity";

import { SCORER_VARIANTS, type ScorerCase, type ScorerVariant } from "./fixtures";
import { mean, ratio, ratioOf, stddev, type MetricRow, type MetricValue, type Ratio } from "./report";

/**
 * 评分器的蜕变断言：真值由变体的构造关系给出，不需要人评。
 *   base > drop > fluff；offtopic < base；|para − base| ≤ 10；
 *   err 的 error 类短板必须引用到插入的错句 Z。
 */

export const PARAPHRASE_TOLERANCE = 10;
/** 引用与错句去标点后的最长公共子串至少这么长才算"点出了错句"。 */
export const OVERLAP_MIN_CHARS = 8;

function lettersOnly(value: string): string {
  return normalizedText(value).replace(/[^\p{L}\p{N}]/gu, "");
}

/** 两段文字去标点后是否共享一段不短于 minChars 的子串。 */
export function textsOverlap(a: string, b: string, minChars = OVERLAP_MIN_CHARS): boolean {
  const x = lettersOnly(a);
  const y = lettersOnly(b);
  if (x.length < minChars || y.length < minChars) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  for (let start = 0; start + minChars <= short.length; start += 1) {
    if (long.includes(short.slice(start, start + minChars))) return true;
  }
  return false;
}

/** 评分结果里有没有指出错句：error 类短板的引用重叠，或短板 / 缺口的文字重叠。 */
export function locatesWrongClaim(evaluation: MockInterviewQuestionEvaluation, wrongClaim: string): boolean {
  const quoted = evaluation.weaknesses.some(
    (item) => item.kind === "error" && item.quote !== null && textsOverlap(item.quote, wrongClaim),
  );
  if (quoted) return true;
  const texts = [
    ...evaluation.weaknesses.map((item) => item.point),
    ...evaluation.dimensions.map((item) => item.gap ?? ""),
  ];
  return texts.some((text) => textsOverlap(text, wrongClaim, 6));
}

export type VariantRun = {
  score: number;
  evaluation: MockInterviewQuestionEvaluation;
  metrics: { quoteMissing: number; unexplainedLowScore: number };
  durationMs: number;
  totalTokens: number | null;
};

export type ScorerCaseResult = {
  caseId: string;
  /** 每个变体的 k 次结果。 */
  runs: Record<ScorerVariant, VariantRun[]>;
};

export type ScorerCaseVerdict = {
  caseId: string;
  meanScores: Record<ScorerVariant, number | null>;
  ordering: boolean | null;
  paraphraseStable: boolean | null;
  /** 严格口径：k 次评分全部引用到 Z。 */
  errorLocated: boolean | null;
  /** 多数口径：k 次里过半引用到 Z。 */
  errorLocatedMajority: boolean | null;
  errorLowered: boolean | null;
  /** 删掉关键机制后分数不低于原版：评分器没察觉。 */
  dropUndetected: boolean | null;
  /** 各变体 k 次分数的标准差。 */
  retestStd: Record<ScorerVariant, number | null>;
};

function meanScore(runs: VariantRun[]): number | null {
  return mean(runs.map((run) => run.score));
}

export function judgeScorerCase(item: ScorerCase, result: ScorerCaseResult): ScorerCaseVerdict {
  const meanScores = Object.fromEntries(
    SCORER_VARIANTS.map((variant) => [variant, meanScore(result.runs[variant] ?? [])]),
  ) as Record<ScorerVariant, number | null>;
  const s = meanScores;
  const have = (...variants: ScorerVariant[]) => variants.every((variant) => typeof s[variant] === "number");
  const errRuns = result.runs.err ?? [];
  return {
    caseId: item.id,
    meanScores,
    ordering: have("base", "drop", "fluff", "offtopic") ? s.base! > s.drop! && s.drop! > s.fluff! && s.offtopic! < s.base! : null,
    paraphraseStable: have("base", "para") ? Math.abs(s.para! - s.base!) <= PARAPHRASE_TOLERANCE : null,
    errorLocated: errRuns.length ? errRuns.every((run) => locatesWrongClaim(run.evaluation, item.truth.wrongClaim)) : null,
    errorLocatedMajority: errRuns.length ? errRuns.filter((run) => locatesWrongClaim(run.evaluation, item.truth.wrongClaim)).length * 2 > errRuns.length : null,
    errorLowered: have("base", "err") ? s.err! < s.base! : null,
    dropUndetected: have("base", "drop") ? s.drop! >= s.base! : null,
    retestStd: Object.fromEntries(
      SCORER_VARIANTS.map((variant) => [variant, stddev((result.runs[variant] ?? []).map((run) => run.score))]),
    ) as Record<ScorerVariant, number | null>,
  };
}

export type ScorerMetrics = {
  orderingRate: Ratio;
  paraphraseStableRate: Ratio;
  errorLocatedRate: Ratio;
  errorLocatedMajorityRate: Ratio;
  errorLoweredRate: Ratio;
  dropUndetectedRate: Ratio;
  retestStdMean: number | null;
  retestStdMax: number | null;
  /** 标准差超过 12 的（用例, 变体）。 */
  unstable: string[];
  quoteMissingRate: Ratio;
  unexplainedLowScoreRate: Ratio;
  /** 没有错句的变体（base / para / drop）里被报了 error 类短板的评分次数占比：评分器的误报率。 */
  falseErrorRate: Ratio;
  /** 错句变体里报了 error 类短板的评分次数占比：评分器对真错误的召回。 */
  errorFlaggedRate: Ratio;
  tokensPerCall: number | null;
  msPerCall: number | null;
};

const hasError = (run: VariantRun) => run.evaluation.weaknesses.some((item) => item.kind === "error");
const CLEAN_VARIANTS: ScorerVariant[] = ["base", "para", "drop"];

export function summarizeScorer(verdicts: ScorerCaseVerdict[], results: ScorerCaseResult[]): ScorerMetrics {
  const runs = results.flatMap((result) => Object.values(result.runs).flat());
  const cleanRuns = results.flatMap((result) => CLEAN_VARIANTS.flatMap((variant) => result.runs[variant]));
  const errRuns = results.flatMap((result) => result.runs.err);
  const stds = verdicts.flatMap((verdict) =>
    Object.entries(verdict.retestStd).flatMap(([variant, std]) => (std === null ? [] : [{ key: `${verdict.caseId}/${variant}`, std }])),
  );
  const quotes = runs.reduce(
    (sum, run) => sum + run.evaluation.strengths.length + run.evaluation.weaknesses.filter((item) => item.kind === "error").length + run.metrics.quoteMissing,
    0,
  );
  return {
    orderingRate: ratioOf(verdicts.map((verdict) => verdict.ordering)),
    paraphraseStableRate: ratioOf(verdicts.map((verdict) => verdict.paraphraseStable)),
    errorLocatedRate: ratioOf(verdicts.map((verdict) => verdict.errorLocated)),
    errorLocatedMajorityRate: ratioOf(verdicts.map((verdict) => verdict.errorLocatedMajority)),
    errorLoweredRate: ratioOf(verdicts.map((verdict) => verdict.errorLowered)),
    dropUndetectedRate: ratioOf(verdicts.map((verdict) => verdict.dropUndetected)),
    retestStdMean: mean(stds.map((item) => item.std)),
    retestStdMax: stds.length ? Math.max(...stds.map((item) => item.std)) : null,
    unstable: stds.filter((item) => item.std > 12).map((item) => item.key),
    quoteMissingRate: ratio(runs.reduce((sum, run) => sum + run.metrics.quoteMissing, 0), quotes),
    unexplainedLowScoreRate: ratio(runs.reduce((sum, run) => sum + run.metrics.unexplainedLowScore, 0), runs.length),
    falseErrorRate: ratio(cleanRuns.filter(hasError).length, cleanRuns.length),
    errorFlaggedRate: ratio(errRuns.filter(hasError).length, errRuns.length),
    tokensPerCall: mean(runs.flatMap((run) => (run.totalTokens === null ? [] : [run.totalTokens]))),
    msPerCall: mean(runs.map((run) => run.durationMs)),
  };
}

export function scorerMetricRows(metrics: ScorerMetrics): MetricRow[] {
  return [
    { name: "排序成立率", value: metrics.orderingRate, expect: "≥ 0.9", note: "base > drop > fluff 且 offtopic < base" },
    { name: "复述不变率", value: metrics.paraphraseStableRate, expect: "≥ 0.9", note: `|para − base| ≤ ${PARAPHRASE_TOLERANCE}` },
    { name: "错误定位率（严格：k 次全部）", value: metrics.errorLocatedRate, expect: "≥ 0.8", note: "err 的短板引用到插入的错句" },
    { name: "错误定位率（多数）", value: metrics.errorLocatedMajorityRate, expect: "≥ 0.8" },
    { name: "错误降分率", value: metrics.errorLoweredRate, expect: "记基线" },
    { name: "删机制未检出率", value: metrics.dropUndetectedRate, expect: "记基线", note: "drop ≥ base" },
    { name: "复跑方差（均值）", value: metrics.retestStdMean, expect: "≤ 6" },
    { name: "复跑方差（最大）", value: metrics.retestStdMax, expect: "单条 > 12 列出", note: metrics.unstable.join(", ") },
    { name: "引用置空率", value: metrics.quoteMissingRate, expect: "≤ 0.1" },
    { name: "误报率（无错回答被报 error）", value: metrics.falseErrorRate, expect: "≤ 0.1", note: "base / para / drop 变体" },
    { name: "错句被报 error 率", value: metrics.errorFlaggedRate, expect: "≥ 0.8", note: "err 变体" },
    { name: "低分无短板率", value: metrics.unexplainedLowScoreRate, expect: "0" },
    { name: "每次评分 token", value: metrics.tokensPerCall, expect: "记基线" },
    { name: "每次评分耗时 ms", value: metrics.msPerCall, expect: "记基线" },
  ];
}

export function flattenScorerMetrics(metrics: ScorerMetrics): Record<string, MetricValue> {
  return {
    orderingRate: metrics.orderingRate,
    paraphraseStableRate: metrics.paraphraseStableRate,
    errorLocatedRate: metrics.errorLocatedRate,
    errorLocatedMajorityRate: metrics.errorLocatedMajorityRate,
    errorLoweredRate: metrics.errorLoweredRate,
    dropUndetectedRate: metrics.dropUndetectedRate,
    retestStdMean: metrics.retestStdMean,
    retestStdMax: metrics.retestStdMax,
    quoteMissingRate: metrics.quoteMissingRate,
    unexplainedLowScoreRate: metrics.unexplainedLowScoreRate,
    tokensPerCall: metrics.tokensPerCall,
    msPerCall: metrics.msPerCall,
  };
}
