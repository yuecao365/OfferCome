/**
 * 结构化输出契约（设计修订 v3 §12.3）：OpenAI 之外的服务商不按 schema 约束输出，模型常把类型写偏——
 * 字符串写成对象、布尔写成 "true" 或数组、数字写成字符串、多写几个键、枚举大小写不对。
 * 这里按 JSON Schema 把值往正确的类型上收敛（能收的收，收不了的原样留给校验报错），校验失败再带错误重试一次。
 * 纯函数，不依赖 zod：输入是 asSchema(...).jsonSchema 那份 JSON Schema。
 */

type JsonSchema = {
  type?: string | string[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
};

function typesOf(schema: JsonSchema): string[] {
  if (Array.isArray(schema.type)) return schema.type;
  if (typeof schema.type === "string") return [schema.type];
  if (schema.enum) return [...new Set(schema.enum.map((item) => (item === null ? "null" : typeof item)))];
  return [];
}

/** 可空的 schema（anyOf [X, null] 或 type 数组含 null）拆成"主 schema + 是否可空"。 */
function unwrap(schema: JsonSchema): { main: JsonSchema; nullable: boolean } {
  const options = schema.anyOf ?? schema.oneOf;
  if (options) {
    const nonNull = options.filter((item) => !(item.type === "null"));
    if (nonNull.length === 1) return { main: nonNull[0], nullable: nonNull.length !== options.length };
    return { main: schema, nullable: options.some((item) => item.type === "null") };
  }
  const types = typesOf(schema);
  if (types.includes("null")) return { main: { ...schema, type: types.filter((item) => item !== "null") }, nullable: true };
  return { main: schema, nullable: false };
}

function coerceString(value: unknown, schema: JsonSchema): unknown {
  let text: string;
  if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else if (value == null) return value;
  else text = JSON.stringify(value);
  if (schema.enum && !schema.enum.includes(text)) {
    const match = schema.enum.find((item) => typeof item === "string" && item.toLowerCase() === text.trim().toLowerCase());
    if (match !== undefined) return match;
  }
  return typeof schema.maxLength === "number" && text.length > schema.maxLength ? text.slice(0, schema.maxLength) : text;
}

function coerceNumber(value: unknown, schema: JsonSchema, integer: boolean): unknown {
  let number: number;
  if (typeof value === "number") number = value;
  else if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) number = Number(value);
  else if (typeof value === "boolean") number = value ? 1 : 0;
  else return value;
  if (integer) number = Math.round(number);
  if (typeof schema.minimum === "number") number = Math.max(schema.minimum, number);
  if (typeof schema.maximum === "number") number = Math.min(schema.maximum, number);
  return number;
}

function coerceBoolean(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["true", "yes", "是", "1"].includes(text)) return true;
    if (["false", "no", "否", "0", ""].includes(text)) return false;
  }
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0 && value.every((item) => item === true);
  return value;
}

export function coerceToJsonSchema(schema: JsonSchema, value: unknown): unknown {
  const { main, nullable } = unwrap(schema);
  if (value === null || value === undefined) return nullable ? null : value;
  const types = typesOf(main);
  if (types.includes("object") && main.properties) {
    if (typeof value !== "object" || Array.isArray(value)) return value;
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const known = main.properties;
    for (const [key, raw] of Object.entries(source)) {
      const property = known[key];
      if (property) result[key] = coerceToJsonSchema(property, raw);
      else if (main.additionalProperties !== false) result[key] = raw;
    }
    for (const key of main.required ?? []) {
      if (key in result) continue;
      const property = known[key];
      if (!property) continue;
      const kinds = typesOf(unwrap(property).main);
      if (unwrap(property).nullable) result[key] = null;
      else if (kinds.includes("array")) result[key] = [];
    }
    return result;
  }
  if (types.includes("array")) {
    let list: unknown[];
    if (Array.isArray(value)) list = value;
    else if (typeof value === "string" && value.trim().startsWith("[")) {
      try {
        list = JSON.parse(value) as unknown[];
      } catch {
        list = [value];
      }
    } else list = [value];
    if (typeof main.maxItems === "number" && list.length > main.maxItems) list = list.slice(0, main.maxItems);
    return main.items ? list.map((item) => coerceToJsonSchema(main.items!, item)) : list;
  }
  if (types.includes("string")) return coerceString(value, main);
  if (types.includes("integer")) return coerceNumber(value, main, true);
  if (types.includes("number")) return coerceNumber(value, main, false);
  if (types.includes("boolean")) return coerceBoolean(value);
  return value;
}
