import assert from "node:assert/strict";
import test from "node:test";

import {
  parseJsonArray,
  parseJsonObject,
  parseJsonStringArray,
  parseJsonValue,
} from "./json";

test("parses stored JSON fields", () => {
  assert.deepEqual(parseJsonValue('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonObject('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonArray("[1,2]"), [1, 2]);
  assert.deepEqual(parseJsonStringArray('["x","y"]'), ["x", "y"]);
});

test("degrades malformed JSON to an empty value instead of throwing", () => {
  assert.equal(parseJsonValue("{ not json"), null);
  assert.deepEqual(parseJsonObject("{ not json"), {});
  assert.deepEqual(parseJsonArray("{ not json"), []);
  assert.deepEqual(parseJsonStringArray("{ not json"), []);
});

test("treats empty and missing fields the same as malformed ones", () => {
  for (const empty of [null, undefined, ""]) {
    assert.equal(parseJsonValue(empty), null);
    assert.deepEqual(parseJsonObject(empty), {});
    assert.deepEqual(parseJsonArray(empty), []);
  }
});

test("rejects values of the wrong shape", () => {
  // 数组不是对象，对象也不是数组——各自返回自己的空值。
  assert.deepEqual(parseJsonObject("[1,2]"), {});
  assert.deepEqual(parseJsonArray('{"a":1}'), []);
  assert.deepEqual(parseJsonObject('"just a string"'), {});
});

test("drops non-string entries from string lists", () => {
  assert.deepEqual(parseJsonStringArray('["ok",1,null,"fine"]'), ["ok", "fine"]);
});
