import assert from "node:assert/strict";
import test from "node:test";

import { detectCandidateIntent, parseThreadVerdict } from "./actions";

test("verdict 只认四个枚举值", () => {
  assert.equal(parseThreadVerdict("thin"), "thin");
  assert.equal(parseThreadVerdict("skipped"), "skipped");
  assert.equal(parseThreadVerdict("great"), null);
  assert.equal(parseThreadVerdict(null), null);
});

test("候选人的插话只有结束由代码判：别问了 / 不想答了 / 算了吧算结束，求助、跳过交给面试官", () => {
  for (const text of ["别问了", "不想答了", "算了吧", "我们结束吧"]) assert.equal(detectCandidateIntent(text), "end", text);
  for (const text of ["这题跳过", "能给点提示吗", "再说一遍", "具体点"]) assert.equal(detectCandidateIntent(text), null, text);
  assert.equal(detectCandidateIntent("这个系统最后结束的时候会把状态写回数据库，然后再通知下游，整个链路大概是这样的，中间还有一次幂等校验和一次重试。"), null, "长回答里的\"结束\"不算");
});
