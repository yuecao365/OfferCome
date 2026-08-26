import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { salvageJson } from "./salvage-json";

const schema = z.object({ items: z.array(z.string()).min(1) });

test("pulls a usable object out of surrounding chatter", () => {
  const rescue = salvageJson(schema);
  assert.deepEqual(rescue('好的，结果如下：{"items":["a","b"]} 以上。'), {
    items: ["a", "b"],
  });
});

test("returns nothing when there is no output to salvage", () => {
  const rescue = salvageJson(schema);
  assert.equal(rescue(undefined), null);
  assert.equal(rescue(""), null);
  assert.equal(rescue("完全没有结构化内容"), null);
  // 被截断到连右括号都没有时无从下手。
  assert.equal(rescue('{"items":["a"'), null);
});

test("returns nothing when the salvaged object fails the schema", () => {
  const rescue = salvageJson(schema);
  assert.equal(rescue('{"items":[]}'), null);
  assert.equal(rescue('{"other":1}'), null);
});

test("falls back to a looser reading when the strict schema rejects the payload", () => {
  const rescue = salvageJson(schema, {
    fallback: (parsed) => {
      const record = parsed as { items?: unknown };
      return Array.isArray(record.items)
        ? { items: record.items.map(String) }
        : null;
    },
  });
  // 严格 schema 要求字符串数组，宽松读法把数字也收下。
  assert.deepEqual(rescue('{"items":[1,2]}'), { items: ["1", "2"] });
  assert.equal(rescue('{"nothing":true}'), null);
});

test("lets a domain check reject a schema-valid result", () => {
  const rescue = salvageJson(schema, {
    accept: (value) => value.items.length >= 2,
    fallback: () => null,
  });
  assert.equal(rescue('{"items":["only-one"]}'), null);
  assert.deepEqual(rescue('{"items":["a","b"]}'), { items: ["a", "b"] });
});
