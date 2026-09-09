import assert from "node:assert/strict";
import test from "node:test";

import { rescueVerdict } from "./judge";
import { rescueReply } from "./simulator";

test("rescueReply salvages truncated or malformed JSON and falls back to plain text", () => {
  assert.deepEqual(rescueReply('{"reply":"我先说结论。"},"saidWrongClaim":false}'), { reply: "我先说结论。" });
  assert.deepEqual(rescueReply('```json\n{"reply":"带围栏的回答"}\n```'), { reply: "带围栏的回答" });
  assert.deepEqual(rescueReply("直接给了一段没有 JSON 的回答"), { reply: "直接给了一段没有 JSON 的回答" });
  assert.equal(rescueReply('{"content":"键名不对"}'), null);
  assert.equal(rescueReply(undefined), null);
});

test("rescueVerdict reads the boolean out of broken judge output", () => {
  assert.equal(rescueVerdict('{"verdict": true, "reason": "顺着"}')?.verdict, true);
  assert.equal(rescueVerdict('{"verdict":false')?.verdict, false);
  assert.equal(rescueVerdict("不知道"), null);
});
