/**
 * 一段问答的判断（verdict）：切段时只知道有没有回答（skipped / answered），评分落库后按分数推导（§11.2）。
 * 评分与报告按它解释"没答上"与"跳过"。
 */

export const THREAD_VERDICTS = ["answered", "thin", "failed", "skipped"] as const;
export type ThreadVerdict = (typeof THREAD_VERDICTS)[number];
export const THREAD_VERDICT_LABELS: Record<ThreadVerdict, string> = {
  answered: "有实质回答",
  thin: "只有关键词",
  failed: "没答上",
  skipped: "跳过",
};

/** 评分 → 判断：50 以下没答上，70 以下只有关键词，其余有实质回答。 */
export function verdictForScore(score: number): ThreadVerdict {
  return score < 50 ? "failed" : score < 70 ? "thin" : "answered";
}

/** 库里 / 载荷里的 verdict 字符串 → 枚举；不认识的当没有。 */
export function parseThreadVerdict(value: unknown): ThreadVerdict | null {
  return typeof value === "string" && (THREAD_VERDICTS as readonly string[]).includes(value) ? (value as ThreadVerdict) : null;
}
