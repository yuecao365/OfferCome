import assert from "node:assert/strict";
import test from "node:test";

import { DURATION_MINUTES, estimateClock, hardCap, minExchanges, realTimeClock, renderClock } from "./clock";

const say = (content: string) => ({ role: "interviewer" as const, content });
const answer = (content: string) => ({ role: "candidate" as const, content });

test("档位按试用者的耐心定：快速 10、标准 20、深入 35 分钟", () => {
  assert.deepEqual(DURATION_MINUTES, { quick: 10, standard: 20, deep: 35 });
});

test("按字数与交换开销折算分钟：答疑只值几秒，长回答才吃时间", () => {
  const short = estimateClock([say("你好，先介绍一下自己。"), answer("能具体一点吗？"), say("就讲你负责的模块。")], 20);
  assert.ok(short.usedMinutes < 1, `两句短话只该花不到 1 分钟，实际 ${short.usedMinutes}`);
  assert.equal(short.exchanges, 2);
  assert.equal(short.phase, "open");
  const long = estimateClock([say("讲讲项目。"), answer("一".repeat(400))], 20);
  assert.ok(long.usedMinutes >= 1.9 && long.usedMinutes <= 2.2, `400 字回答约 1.7 分钟加读题开销，实际 ${long.usedMinutes}`);
  // 一条回答最多记 2.5 分钟：打字慢、写得长是用户自己的时间，不吃面试的时间盒。
  const capped = estimateClock([say("讲讲项目。"), answer("一".repeat(2000))], 20);
  assert.ok(capped.usedMinutes >= 2.8 && capped.usedMinutes <= 2.9, `2000 字也只记 2.5 分钟，实际 ${capped.usedMinutes}`);
});

test("到 75% 进入 late，90% 提醒收尾；100% 且问够了才结束；交换数到硬顶也结束", () => {
  // 每次交换：面试官一句 + 600 字回答 ≈ 2.85 分钟。
  const exchanges = (count: number) => Array.from({ length: count }, () => [say("问一句。"), answer("一".repeat(600))]).flat();
  assert.equal(estimateClock(exchanges(5), 20).phase, "open");
  assert.equal(estimateClock(exchanges(6), 20).phase, "late");
  assert.equal(estimateClock(exchanges(7), 20).phase, "wrap_up");
  // 时间到了但每档至少要问够：标准 20 分钟至少 10 问。
  assert.equal(minExchanges(20), 10);
  assert.equal(estimateClock(exchanges(8), 20).phase, "wrap_up");
  assert.equal(estimateClock(exchanges(10), 20).phase, "over");
  assert.equal(hardCap(20), 22);
  const chatter = Array.from({ length: 22 }, () => say("嗯？"));
  assert.equal(estimateClock(chatter, 20).phase, "over");
  assert.equal(estimateClock(chatter.slice(0, 21), 20).phase, "open");
});

test("给面试官的一行随阶段变", () => {
  assert.match(renderClock({ usedMinutes: 3, totalMinutes: 20, exchanges: 4, phase: "open" }), /还剩约 17 分钟。$/);
  assert.match(renderClock({ usedMinutes: 18.5, totalMinutes: 20, exchanges: 15, phase: "wrap_up" }), /该收的收/);
  assert.match(renderClock({ usedMinutes: 21, totalMinutes: 20, exchanges: 15, phase: "over" }), /只告别/);
});

test("语音版真实作答时间：只记'面试官说完 → 候选人的话落下'，每题最多 4 分钟；还没答的不计；问够了才结束", () => {
  const start = new Date("2026-09-15T08:00:00Z");
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
  const ask = (minutes: number) => ({ role: "interviewer" as const, at: at(minutes) });
  const reply = (minutes: number) => ({ role: "candidate" as const, at: at(minutes) });
  // 两题：答了 2 分钟、答了 1.5 分钟，再加每题 20 秒开销 ≈ 4.2 分钟。
  const two = [ask(0), reply(2), ask(2.2), reply(3.7), ask(4)];
  assert.equal(realTimeClock(two, 20).usedMinutes, 4.5);
  // 开着房间 30 分钟才答第一题：这一题最多记 4 分钟。
  assert.equal(realTimeClock([ask(0), reply(30), ask(31)], 20).usedMinutes, 4.7);
  // 最后一问还没答：不计。
  assert.equal(realTimeClock([ask(0), reply(2), ask(2.2)], 20).usedMinutes, 2.7);
  // 没有时刻的句子只按开销算。
  assert.equal(realTimeClock([{ role: "interviewer" }, { role: "candidate" }], 20).usedMinutes, 0.3);
  // 时间到了但只问了 3 个：还不结束；问够 10 个才结束。
  const long = (count: number) => Array.from({ length: count }, (_, index) => [ask(index * 4), reply(index * 4 + 3.9)]).flat();
  assert.equal(realTimeClock(long(3), 10).phase, "wrap_up");
  assert.equal(realTimeClock(long(5), 10).phase, "over");
});

