/**
 * SQLite 没有 JSON 列，模型产出的结构化结果全部以字符串存在 *Json 字段里，
 * 读出来时都要解析一次。此前这个"解析失败就降级"的小函数在 7 个文件里
 * 各写了一遍，返回值还各不相同（null / {} / []），调用方得逐个记住。
 *
 * 解析失败一律当作"没有数据"，绝不抛错——这些字段大多是展示用的附加信息，
 * 不该因为一条脏数据把整页打挂。
 */

/** 解析失败返回 null。 */
export function parseJsonValue(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** 解析失败或结果不是对象时返回空对象。 */
export function parseJsonObject(
  value: string | null | undefined,
): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

/** 解析失败或结果不是数组时返回空数组。 */
export function parseJsonArray(value: string | null | undefined): unknown[] {
  const parsed = parseJsonValue(value);
  return Array.isArray(parsed) ? parsed : [];
}

/** 只保留字符串元素，用于 strengths / improvements 这类纯文案列表。 */
export function parseJsonStringArray(
  value: string | null | undefined,
): string[] {
  return parseJsonArray(value).filter(
    (item): item is string => typeof item === "string",
  );
}
