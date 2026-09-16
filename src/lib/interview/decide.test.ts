import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { areaToAsk, coveredIds, currentTopic, decideMove, trailingDontKnows } from "./decide";
import type { TranscriptLine } from "./events";

/** 一个决策（§10）：配额进度 + 候选人这句的类型 → 这回合问哪份材料的哪个角度；讲透了怎么办也写好。 */

let seq = 0;
const ask = (topic: string | null, facet: number | null = null, doneFacet: number | null = null, content = "问一句？"): TranscriptLine => ({ seq: seq++, role: "interviewer", content, kind: "say", control: null, topic, facet, doneFacet });
const say = (content: string, control: TranscriptLine["control"] = null): TranscriptLine => ({ seq: seq++, role: "candidate", content, kind: null, control });
const brief = testBrief();
const decide = (transcript: TranscriptLine[], opening = false) => decideMove({ brief, transcript, opening, seed: "s" });

test("话题与连续答不上：当前话题往回找第一个非空的；答不上不按话题分", () => {
  const transcript = [ask("p1-module"), say("答"), ask(null), say("我不会"), ask("p1-module"), say("不知道")];
  assert.equal(currentTopic(transcript), "p1-module");
  assert.equal(trailingDontKnows(transcript), 2);
  assert.equal(trailingDontKnows([ask("p1-module"), say("我不会"), ask("q1"), say("答"), ask("q1"), say("不知道")]), 1);
  assert.deepEqual(coveredIds([ask("p1-module"), say("a"), ask("q1"), say("b"), ask("p1-module")]), ["p1-module", "q1"]);
});

test("开场与进第一份材料：开场只问候；开场答完切到计划第一份的切入问法", () => {
  const opening = decide([], true);
  assert.equal(opening.move, "continue");
  assert.equal(opening.target, null);
  const first = decide([ask(null), say("我叫小王")]);
  assert.equal(first.move, "switch");
  assert.deepEqual(first.target, { topic: "p1-overview", facet: null });
  assert.match(first.reason, /开场结束：换到「Study Assistant：背景与架构」（p1-overview）/);
});

test("项目：切入答完进第一个角度（无条件）；追问回合给两边——讲透了换角度或换材料，没讲透接着问；同一角度追满 2 句无条件换", () => {
  const entry = decide([ask("p1-overview"), say("讲了架构")]);
  assert.equal(entry.move, "continue");
  assert.equal(entry.target?.topic, "p1-overview");
  assert.ok(entry.target?.facet === 0 || entry.target?.facet === 1);
  assert.equal(entry.ifDone, undefined);
  assert.match(entry.reason, /切入问完了：追问角度「/);
  const probing = decide([ask("p1-overview"), say("a"), ask("p1-overview", 0), say("b")]);
  assert.equal(probing.move, "continue");
  assert.deepEqual(probing.target, { topic: "p1-overview", facet: 0 });
  assert.deepEqual(probing.ifDone, { topic: "p1-overview", facet: 1 });
  assert.match(probing.reason, /若候选人这段把它讲透了.*facetDone 填 true.*换到角度「安全链路」/);
  const run = decide([ask("p1-overview"), say("a"), ask("p1-overview", 0), say("b"), ask("p1-overview", 0), say("c")]);
  assert.deepEqual(run.target, { topic: "p1-overview", facet: 1 });
  assert.equal(run.ifDone, undefined);
  assert.match(run.reason, /已经追了 2 句：换到角度「安全链路」/);
  // 两个角度一个讲透、一个在追：讲透了就没有别的角度，换下一份材料。
  const last = decide([ask("p1-overview"), say("a"), ask("p1-overview", 0), say("b"), ask("p1-overview", 1, 0), say("c")]);
  assert.deepEqual(last.target, { topic: "p1-overview", facet: 1 });
  assert.deepEqual(last.ifDone, { topic: "p1-module", facet: null });
  assert.match(last.reason, /换到下一份材料「Study Assistant：模块深挖」（p1-module）/);
});

test("预算用完、跳过、连续两次答不上都无条件换到下一份；求助与第一次答不上是答疑（先于预算、不换题）；最后一份聊完就收尾", () => {
  const spent = decide([ask("p1-overview"), say("a"), ask("p1-overview", 0), say("b"), ask("p1-overview", 1), say("c"), ask("p1-overview", 0), say("d")]);
  assert.equal(spent.move, "switch");
  assert.deepEqual(spent.target, { topic: "p1-module", facet: null });
  assert.match(spent.reason, /预算用完了：换到「Study Assistant：模块深挖」（p1-module）/);
  assert.equal(decide([ask("p1-overview"), say("", "skip")]).move, "switch");
  const twice = decide([ask("q1"), say("我不会"), ask("q1", 0), say("不知道")]);
  assert.equal(twice.move, "switch");
  assert.deepEqual(twice.target, { topic: "q2", facet: null });
  assert.match(twice.reason, /连续两次答不上/);
  const once = decide([ask("q1"), say("我不会")]);
  assert.equal(once.move, "clarify");
  assert.deepEqual(once.target, { topic: "q1", facet: null });
  assert.match(once.reason, /降一层再问一次/);
  const help = decide([ask("q1", 0), say("能具体一点吗？")]);
  assert.equal(help.move, "clarify");
  assert.deepEqual(help.target, { topic: "q1", facet: 0 });
  assert.match(help.reason, /把上一句问的题说具体，还是这个角度，不换题/);
  // 预算刚用完时说"什么意思"：答疑，不换题（2026-09-16 实测的失败）。
  const spentHelp = decide([ask("q1"), say("a"), ask("q1", 0), say("什么意思？")]);
  assert.equal(spentHelp.move, "clarify");
  assert.deepEqual(spentHelp.target, { topic: "q1", facet: 0 });
  const closing = decide([ask("s1"), say("a"), ask("s1", 0), say("b"), ask("s1", 1), say("c")]);
  assert.equal(closing.move, "close");
  assert.equal(closing.target, null);
  assert.match(closing.reason, /配额里的材料都聊完了：告别/);
});

test("基础题与场景题：切入答完看答得实不实——讲透了换材料，否则按顺序追问；最后一份材料讲透了就告别", () => {
  const quick = decide([ask("q1"), say("讲了机制")]);
  assert.equal(quick.move, "continue");
  assert.deepEqual(quick.target, { topic: "q1", facet: 0 });
  assert.deepEqual(quick.ifDone, { topic: "q2", facet: null });
  assert.match(quick.reason, /若这段已经答实.*换到下一份材料「MySQL 索引」（q2）/);
  const scenario = decide([ask("s1"), say("先看库存扣减")]);
  assert.deepEqual(scenario.target, { topic: "s1", facet: 0 });
  assert.equal(scenario.ifDone, null, "最后一份材料：讲透了就告别");
  assert.match(scenario.reason, /告别（closing 填 true）/);
});

test("底线改问的材料：换材料的回合是决策指的那份；追问的回合是计划里的下一份", () => {
  const transcript = [ask("p1-overview"), say("a")];
  assert.equal(areaToAsk(brief, transcript, { move: "switch", reason: "", target: { topic: "q1", facet: null } })?.id, "q1");
  assert.equal(areaToAsk(brief, transcript, { move: "continue", reason: "", target: { topic: "p1-overview", facet: 0 } })?.id, "p1-module");
  assert.equal(areaToAsk(brief, [ask("s1"), say("a")], { move: "continue", reason: "", target: { topic: "s1", facet: 0 } }), null);
});
