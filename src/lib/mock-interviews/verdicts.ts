/**
 * 一段问答的判断（verdict）：整理员切段时给每段一个；评分与报告按它解释"没答上"与"跳过"。
 * 旧系统由面试官在离开话题时记；重建后由事后整理员从逐字稿判断。
 */

export const THREAD_VERDICTS = ["answered", "thin", "failed", "skipped"] as const;
export type ThreadVerdict = (typeof THREAD_VERDICTS)[number];
export const THREAD_VERDICT_LABELS: Record<ThreadVerdict, string> = {
  answered: "有实质回答",
  thin: "只有关键词",
  failed: "没答上",
  skipped: "跳过",
};

/** 库里 / 载荷里的 verdict 字符串 → 枚举；不认识的当没有。 */
export function parseThreadVerdict(value: unknown): ThreadVerdict | null {
  return typeof value === "string" && (THREAD_VERDICTS as readonly string[]).includes(value) ? (value as ThreadVerdict) : null;
}
