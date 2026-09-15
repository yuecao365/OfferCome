import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { coveredIds, currentTopic, decideMove, topicRun, trailingDontKnows } from "./decide";
import type { TranscriptLine } from "./events";

const clock = (usedMinutes: number, phase: "open" | "late" | "wrap_up" | "over" = "open") => ({ usedMinutes, totalMinutes: 20, exchanges: 5, phase });
let seq = 0;
const ask = (topic: string | null, content = "问一句？"): TranscriptLine => ({ seq: seq++, role: "interviewer", content, kind: "say", control: null, topic });
const say = (content: string, control: TranscriptLine["control"] = null): TranscriptLine => ({ seq: seq++, role: "candidate", content, kind: null, control });

test("话题：当前话题往回找第一个非空的；一段里追了几轮；最近连续答不上几次不按话题分", () => {
  const transcript = [ask("p1-module"), say("答"), ask(null), say("我不会"), ask("p1-module"), say("不知道")];
  assert.equal(currentTopic(transcript), "p1-module");
  assert.deepEqual(topicRun(transcript), { topic: "p1-module", probes: 2 });
  assert.equal(trailingDontKnows(transcript), 2);
  assert.equal(trailingDontKnows([ask("p1-module"), say("我不会"), ask("q1"), say("不知道")]), 2);
  assert.equal(trailingDontKnows([ask("p1-module"), say("我不会"), ask("q1"), say("答"), ask("q1"), say("不知道")]), 1);
  assert.deepEqual(coveredIds([ask("p1-module"), say("a"), ask("q1"), say("b"), ask("p1-module")]), ["p1-module", "q1"]);
  assert.deepEqual(topicRun([ask("p1-module"), say("a"), ask("q1"), say("我不会")]), { topic: "q1", probes: 0 });
  assert.equal(trailingDontKnows([ask("q1"), say("我不太清楚，就是AI自己总结的")]), 1);
});

test("决策优先级：开场 → 时间到 → 快到时间 → 跳过 → 两次答不上 → 求助 / 答不上一次 → 场景题该进 → 基础题该转 → 追太多轮 → 继续", () => {
  const brief = testBrief();
  const base = { brief, clock: clock(5) };
  assert.equal(decideMove({ ...base, transcript: [], opening: true }).move, "continue");
  assert.equal(decideMove({ ...base, clock: clock(21, "over"), transcript: [ask("p1-module"), say("答")], opening: false }).move, "close");
  assert.match(decideMove({ ...base, clock: clock(18.5, "wrap_up"), transcript: [ask("p1-module"), say("", "skip")], opening: false }).reason, /快到时间/);
  const skipped = decideMove({ ...base, transcript: [ask("p1-module"), say("", "skip")], opening: false });
  assert.equal(skipped.move, "switch");
  assert.match(skipped.reason, /要求跳过：换到「/);
  const twice = decideMove({ ...base, transcript: [ask("q1"), say("我不会"), ask("q1", "换个说法？"), say("不知道")], opening: false });
  assert.equal(twice.move, "switch");
  assert.match(twice.reason, /两次答不上/);
  assert.doesNotMatch(twice.reason, /（q1）/);
  // 自报材料换了（常是误报）也照数：连续两次答不上就换。
  const misreported = decideMove({ ...base, transcript: [ask("q1"), say("我不会"), ask("q2", "说具体一点？"), say("不知道")], opening: false });
  assert.equal(misreported.move, "switch");
  const once = decideMove({ ...base, transcript: [ask("q1"), say("我不会")], opening: false });
  assert.equal(once.move, "continue");
  assert.match(once.reason, /降一层再问一次/);
  assert.match(decideMove({ ...base, transcript: [ask("q1"), say("能具体一点吗？")], opening: false }).reason, /把题说具体，不换题/);
  const late = decideMove({ brief, clock: clock(16, "late"), transcript: [ask("p1-module"), say("答"), ask("q1"), say("答")], opening: false });
  assert.equal(late.move, "switch");
  assert.match(late.reason, /场景题还没问：换到「.*」（s1）/);
  const half = decideMove({ brief, clock: clock(11), transcript: [ask("p1-module"), say("答")], opening: false });
  assert.equal(half.move, "switch");
  assert.match(half.reason, /基础题还一道没问：换到「/);
  const probed = decideMove({ ...base, transcript: [ask("p1-module"), say("a"), ask(null), say("b"), ask(null), say("c"), ask(null), say("d")], opening: false });
  assert.equal(probed.move, "switch");
  assert.match(probed.reason, /追了 3 轮/);
  assert.equal(decideMove({ ...base, transcript: [ask("p1-module"), say("a")], opening: false }).move, "continue");
});
