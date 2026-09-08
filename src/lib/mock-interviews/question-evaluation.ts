import { z } from "zod";

import { normalizedText } from "@/lib/text/similarity";

/**
 * 逐题评分的纯逻辑：输入解析、输出校验、引用硬门。
 * 评分 v2：优点与短板都要落到候选人的原话上，练什么单独列；模型看得到线程深度与面试官的现场判断。
 */

const rubricItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  weight: z.number().positive(),
});

export const WEAKNESS_KINDS = ["error", "missing"] as const;
export type WeaknessKind = (typeof WEAKNESS_KINDS)[number];

export type EvaluationStrength = { point: string; quote: string | null };
export type EvaluationWeakness = { point: string; quote: string | null; kind: WeaknessKind };

export type MockInterviewQuestionEvaluation = {
  dimensions: { name: string; score: number; evidence: string; gap: string | null }[];
  strengths: EvaluationStrength[];
  weaknesses: EvaluationWeakness[];
  advice: string[];
  feedback: string;
};

/** 示范回答（只在有短板时生成）：用候选人自己的项目示范这段可以怎么答。 */
export type AnswerExemplar = {
  exemplar: string;
  /** 对应哪些短板（weakness 的 point）。 */
  addressed: string[];
  /** 示范里有核实不了的数字，已抹掉。 */
  degraded: boolean;
};

/** 线程的过程信号：追问深度与面试官关线程时的判断，评分要按达到的深度给分。 */
export type EvaluationThreadContext = {
  depth: number;
  targetDepth: number;
  probeCount: number;
  rescues: number;
  note: string | null;
};

export type EvaluationMetrics = {
  /** 引用不在回答里、被置空的条数。 */
  quoteMissing: number;
  /** 分数低于 70 却没有任何短板说明。 */
  unexplainedLowScore: number;
};

export function parseQuestionEvaluationInput(input: { rubric: unknown; expectedSignals: unknown }) {
  const rubric = z.array(rubricItemSchema).safeParse(input.rubric);
  const expectedSignals = z.array(z.string()).safeParse(input.expectedSignals);
  return {
    rubric: rubric.success ? rubric.data : [],
    expectedSignals: expectedSignals.success ? expectedSignals.data : [],
  };
}

/** 引用必须逐字来自回答（归一化后是子串，且不短于 4 个字符）。 */
export function quoteInAnswer(answer: string, quote: string | null): boolean {
  if (!quote) return false;
  const needle = normalizedText(quote);
  return needle.length >= 4 && normalizedText(answer).includes(needle);
}

/**
 * 维度名与评分表逐一对应（缺的补 0、多的丢）；不在回答里的引用置空并计数；
 * 低分而无短板计数。计数进 AgentRun 指标，之后评测直接读。
 */
export function validateQuestionEvaluation(
  output: MockInterviewQuestionEvaluation,
  rubric: Array<{ name: string }>,
  answer: string,
  score: number,
): { evaluation: MockInterviewQuestionEvaluation; metrics: EvaluationMetrics } {
  const allowed = new Set(rubric.map((item) => item.name));
  const seen = new Set<string>();
  const dimensions = output.dimensions.filter((dimension) => {
    if (!allowed.has(dimension.name) || seen.has(dimension.name)) return false;
    seen.add(dimension.name);
    return true;
  });
  let quoteMissing = 0;
  const withQuote = <T extends { quote: string | null }>(item: T): T => {
    if (item.quote === null || quoteInAnswer(answer, item.quote)) return item;
    quoteMissing += 1;
    return { ...item, quote: null };
  };
  const evaluation: MockInterviewQuestionEvaluation = {
    dimensions,
    strengths: output.strengths.map(withQuote),
    weaknesses: output.weaknesses.map(withQuote),
    advice: output.advice,
    feedback: output.feedback,
  };
  return {
    evaluation,
    metrics: { quoteMissing, unexplainedLowScore: evaluation.weaknesses.length === 0 && score < 70 ? 1 : 0 },
  };
}

/** 从库里读出来的评分：旧记录的 strengths 是字符串数组，统一成带引用的形状。 */
export function parseStoredEvaluationList<T extends { point: string }>(
  value: unknown,
  fromString: (text: string) => T,
): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return item.trim() ? [fromString(item)] : [];
    if (item && typeof item === "object" && typeof (item as { point?: unknown }).point === "string") return [item as T];
    return [];
  });
}

const NUMBER_PATTERN = /\d+(?:[.,]\d+)?\s*(?:%|万|亿|k|K|ms|s|QPS|qps|TPS|tps)?/g;

/** 示范里的数字必须能在简历或回答里找到；找不到的抹成"……"。 */
export function stripUnverifiedNumbers(exemplar: string, sources: string[]): { text: string; removed: number } {
  const haystack = sources.map(normalizedText).join("\n");
  let removed = 0;
  const text = exemplar.replace(NUMBER_PATTERN, (match) => {
    const digits = match.replace(/[^\d.,]/g, "");
    if (digits.length === 0 || haystack.includes(normalizedText(digits))) return match;
    removed += 1;
    return "……";
  });
  return { text, removed };
}
