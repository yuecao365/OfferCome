import assert from "node:assert/strict";
import test from "node:test";

import { compoundQuestionReason, detectCandidateIntent, parseThreadVerdict } from "./actions";

test("一次只问一个问题：两个以上问号或“分别”并列子问题算复合问题", () => {
  assert.equal(compoundQuestionReason("你们的工具是怎么注册的？"), null);
  assert.equal(compoundQuestionReason("如果一个复杂任务被拆成主 Agent 加多个 subagent，你怎么决定哪些任务该拆？"), null);
  assert.match(compoundQuestionReason("怎么决定哪些任务该拆、哪些不该拆？子任务返回什么内容才不会污染主上下文？") ?? "", /一次只问一个问题/);
  assert.match(compoundQuestionReason("检索、规划、写作、校验这几类分别怎么分到主 Agent 和 subagent？") ?? "", /一次只问一个问题/);
  assert.equal(compoundQuestionReason("Why did you choose Redis here?"), null);
  assert.ok(compoundQuestionReason("Why Redis? And why not Kafka?"));
});

test("verdict 只认三个枚举值", () => {
  assert.equal(parseThreadVerdict("thin"), "thin");
  assert.equal(parseThreadVerdict("great"), null);
  assert.equal(parseThreadVerdict(null), null);
});

test("想结束的说法都算结束：别问了 / 不想答了 / 算了吧", () => {
  for (const text of ["别问了", "不想答了", "算了吧", "我们结束吧"]) assert.equal(detectCandidateIntent(text), "end", text);
});
