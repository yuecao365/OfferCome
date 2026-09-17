import assert from "node:assert/strict";
import test from "node:test";

import { asSchema } from "ai";
import { z } from "zod";

import { coerceToJsonSchema } from "./coerce";

/** 输出契约的类型收敛：按 JSON Schema 把模型写偏的类型拉回来，收不了的原样留给校验。 */

const schema = z.object({
  say: z.string().max(10),
  notebook: z.string().max(20).nullable(),
  facetDone: z.boolean(),
  score: z.number().int().min(0).max(100),
  weaknesses: z.array(z.object({ point: z.string(), kind: z.enum(["error", "missing"]), quote: z.string().nullable() })).max(2),
  competencyId: z.string().nullable(),
});
const jsonSchema = asSchema(schema).jsonSchema as Parameters<typeof coerceToJsonSchema>[0];

test("字符串收对象与数字、布尔收字符串与数组、数字收字符串并夹到范围、枚举忽略大小写、多余的键丢掉、缺的可空键补 null", () => {
  const coerced = coerceToJsonSchema(jsonSchema, {
    say: { text: "你好" },
    notebook: 12,
    facetDone: "true",
    score: "87.6",
    weaknesses: [{ point: 1, kind: "Missing", quote: null, extra: "x" }, { point: "p", kind: "error", quote: "q" }, { point: "third", kind: "error", quote: null }],
    stray: "drop me",
  });
  assert.deepEqual(coerced, {
    say: '{"text":"你',
    notebook: "12",
    facetDone: true,
    score: 88,
    weaknesses: [{ point: "1", kind: "missing", quote: null }, { point: "p", kind: "error", quote: "q" }],
    competencyId: null,
  });
  assert.equal(schema.safeParse(coerced).success, true);
  assert.equal((coerceToJsonSchema(jsonSchema, { say: "x", notebook: null, facetDone: [], score: 1, weaknesses: "[]", competencyId: "c1" }) as { facetDone: unknown }).facetDone, false);
});

test("收不了的原样保留，交给校验报错", () => {
  const coerced = coerceToJsonSchema(jsonSchema, { say: "ok", notebook: null, facetDone: true, score: "many", weaknesses: [], competencyId: null }) as { score: unknown };
  assert.equal(coerced.score, "many");
  assert.equal(schema.safeParse(coerced).success, false);
  assert.equal(coerceToJsonSchema(jsonSchema, "not an object"), "not an object");
});
