/**
 * 严格模式结构化输出对 JSON Schema 的两条硬规则：
 * 每个属性都必须出现在 required 里；不允许 default 关键字。
 *
 * 违反时 provider 直接 400，模型根本没跑，错误只会被归为 provider_error。
 * 岗位分析和 JD 补全曾因 `.default()` / `.nullish()` 静默失败了所有会话，
 * 所以在发送前先查一遍，把这类问题变成一次调用就能看懂的报错。
 */
type JsonSchemaNode = Record<string, unknown>;

function isNode(value: unknown): value is JsonSchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(node: unknown, path: string): string | null {
  if (!isNode(node)) return null;

  if ("default" in node) return `${path || "$"} 使用了 default`;

  const properties = node.properties;
  if (isNode(properties)) {
    const required = new Set(
      Array.isArray(node.required) ? (node.required as string[]) : [],
    );
    for (const [key, child] of Object.entries(properties)) {
      const childPath = path ? `${path}.${key}` : key;
      if (!required.has(key)) return `${childPath} 不在 required 里`;
      const violation = walk(child, childPath);
      if (violation) return violation;
    }
  }

  for (const key of ["items", "additionalProperties"] as const) {
    const violation = walk(node[key], path ? `${path}[]` : "[]");
    if (violation) return violation;
  }
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"] as const) {
    const branches = node[key];
    if (!Array.isArray(branches)) continue;
    for (const [index, branch] of branches.entries()) {
      const violation = walk(branch, `${path || "$"}.${key}[${index}]`);
      if (violation) return violation;
    }
  }
  for (const key of ["$defs", "definitions"] as const) {
    const defs = node[key];
    if (!isNode(defs)) continue;
    for (const [name, def] of Object.entries(defs)) {
      const violation = walk(def, `${key}.${name}`);
      if (violation) return violation;
    }
  }
  return null;
}

/** 返回第一处违规的路径说明；兼容严格模式时返回 null。 */
export function findStrictSchemaViolation(schema: unknown): string | null {
  return walk(schema, "");
}
