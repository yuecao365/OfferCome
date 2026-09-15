import assert from "node:assert/strict";
import test from "node:test";

import { DURATION_MINUTES, estimateClock, hardCap, renderClock } from "./clock";

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
  const long = estimateClock([say("讲讲项目。"), answer("一".repeat(800))], 20);
  assert.ok(long.usedMinutes >= 5 && long.usedMinutes <= 6, `800 字回答约 5 分钟，实际 ${long.usedMinutes}`);
});

test("到 75% 进入 late，90% 提醒收尾，100% 或交换数到硬顶就结束", () => {
  const lines = [say("开场"), answer("一".repeat(160 * 15))];
  assert.equal(estimateClock(lines, 20).phase, "late");
  assert.equal(estimateClock([...lines, answer("一".repeat(160 * 3))], 20).phase, "wrap_up");
  assert.equal(estimateClock([...lines, answer("一".repeat(160 * 5))], 20).phase, "over");
  assert.equal(hardCap(20), 16);
  const chatter = Array.from({ length: 16 }, () => say("嗯？"));
  assert.equal(estimateClock(chatter, 20).phase, "over");
  assert.equal(estimateClock(chatter.slice(0, 15), 20).phase, "open");
});

test("给面试官的一行随阶段变", () => {
  assert.match(renderClock({ usedMinutes: 3, totalMinutes: 20, exchanges: 4, phase: "open" }), /还剩约 17 分钟。$/);
  assert.match(renderClock({ usedMinutes: 18.5, totalMinutes: 20, exchanges: 15, phase: "wrap_up" }), /该收的收/);
  assert.match(renderClock({ usedMinutes: 21, totalMinutes: 20, exchanges: 15, phase: "over" }), /只告别/);
});
