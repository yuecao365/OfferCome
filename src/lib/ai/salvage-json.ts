import type { z } from "zod";

/**
 * 结构化输出失败时的通用抢救：模型经常只是被截断，残缺文本里仍有可用结果。
 * 从第一个 { 到最后一个 } 截出来重新解析，交给 schema 校验。
 *
 * 用作 runAgent 的 rescue 钩子。此前岗位分析和出题各写了一份同样的实现。
 */
export function salvageJson<T>(
  schema: z.ZodType<T>,
  options: {
    /** 严格 schema 不过时的第二次机会，比如放宽后的归一化转换。 */
    fallback?: (parsed: unknown) => T | null;
    /** 额外的领域校验，返回 false 视为抢救失败。 */
    accept?: (value: T) => boolean;
  } = {},
): (rawText: string | undefined) => T | null {
  return (rawText) => {
    if (!rawText) return null;

    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }

    const strict = schema.safeParse(parsed);
    if (strict.success && (options.accept?.(strict.data) ?? true)) {
      return strict.data;
    }

    return options.fallback?.(parsed) ?? null;
  };
}
