import { PROFILE_DIMENSION_BY_RUBRIC } from "@/lib/mock-interviews/interviewer/brief";
import { quoteInAnswer } from "@/lib/mock-interviews/question-evaluation";

import type { ProfileDimension } from "./types";

/**
 * 模拟面试的能力观察直接由逐段评分推导，不再让第二个模型重读回答。
 * 评分表维度 → 画像维度按 PROFILE_DIMENSION_BY_RUBRIC 归属；分数按评分与画像共同的分带对齐；
 * 证据优先用评分给出的回答原话（逐字校验），没有原话就用维度缺口。
 */

export type DerivedObservation = {
  questionId: string;
  dimension: ProfileDimension;
  score: number;
  confidence: number;
  evidenceExcerpt: string;
};

export type ScoredDimension = { name: string; score: number; evidence: string; gap: string | null };

/** evaluation-v3 的分带 ↔ 画像 1–5 级锚点：< 50 关键内容错误或没答；50–69 有尝试但关键点缺失；70–89 达到常规要求；≥ 90 准确有取舍可迁移。 */
export function profileLevelForScore(score: number): number {
  if (score >= 90) return 5;
  if (score >= 80) return 4;
  if (score >= 70) return 3;
  if (score >= 50) return 2;
  return 1;
}

const QUOTED_EVIDENCE_CONFIDENCE = 0.9;
const GAP_EVIDENCE_CONFIDENCE = 0.6;

const WRAPPING_QUOTES = /^[\s“”"'「」『』]+|[\s“”"'「」『』]+$/g;

/** 评分的 evidence 常是几句原话加引号、用 " / " 拼起来的，逐句核对，只保留真的在回答里的。 */
function verifiedEvidence(evidence: string, answer: string): string | null {
  const parts = evidence
    .split(/\s*\/\s*|\n+/)
    .map((part) => part.replace(WRAPPING_QUOTES, ""))
    .filter((part) => quoteInAnswer(answer, part));
  return parts.length > 0 ? parts.join(" / ") : null;
}

export function deriveObservationsFromEvaluation(input: {
  questionId: string;
  answer: string;
  dimensions: ScoredDimension[];
}): DerivedObservation[] {
  return input.dimensions.flatMap((item) => {
    const dimension = PROFILE_DIMENSION_BY_RUBRIC[item.name];
    if (!dimension) return [];
    const quoted = verifiedEvidence(item.evidence, input.answer);
    const gap = item.gap?.trim();
    if (!quoted && !gap) return [];
    return [
      {
        questionId: input.questionId,
        dimension,
        score: profileLevelForScore(item.score),
        confidence: quoted ? QUOTED_EVIDENCE_CONFIDENCE : GAP_EVIDENCE_CONFIDENCE,
        evidenceExcerpt: quoted ?? `缺口：${gap}`,
      },
    ];
  });
}
