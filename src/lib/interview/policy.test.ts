import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { renderCoverage, renderTurnMessage } from "./policy";

/** 现场卡的覆盖账与建议：按种类数聊过的材料，按已用时间比例提醒该转；放在候选人的话之前的最后一行。 */

const clock = (usedMinutes: number, phase: "open" | "late" | "wrap_up" | "over" = "open") => ({ usedMinutes, totalMinutes: 20, exchanges: 5, phase });

test("覆盖账：按种类数聊过的材料，没聊过就给默认分配", () => {
  const brief = testBrief();
  assert.match(renderCoverage(brief, [], clock(2)), /^已聊：项目 0 个 0 面、基础题 0 道、场景题 0 道。这场默认分配：项目约 12 分钟、基础题约 4 分钟、场景题约 4 分钟/);
  const line = renderCoverage(brief, ["p1-overview", "p1-module", "q1"], clock(5));
  assert.match(line, /已聊：项目 1 个 2 面（背景与架构、模块深挖）、基础题 1 道、场景题 0 道；聊过的不要再问。/);
  assert.match(renderCoverage(brief, ["nope"], clock(5)), /已聊：项目 0 个 0 面/);
});

test("建议随时间与覆盖变：项目吃掉一半以上时间还没问基础题就催转，75% 后场景题没问就催进，时间到了只告别", () => {
  const brief = testBrief();
  assert.match(renderCoverage(brief, ["p1-overview"], clock(11)), /基础题还一道没问：该转基础题了/);
  assert.match(renderCoverage(brief, ["p1-overview"], clock(13)), /基础题一道没问、场景题也没问：该转了/);
  assert.match(renderCoverage(brief, ["p1-overview", "q1"], clock(16, "late")), /场景题还没问：这句就进场景题/);
  assert.match(renderCoverage(brief, ["p1-overview", "q1", "s1"], clock(16, "late")), /这场默认分配/);
  assert.match(renderCoverage(brief, ["p1-overview"], clock(21, "over")), /时间到了：只告别/);
  // 候选人在求助：再该转也先把这一问说清；时间到了仍只告别。
  assert.match(renderCoverage(brief, ["p1-overview"], clock(13), true), /候选人在求助：先就这一问/);
  assert.match(renderCoverage(brief, ["p1-overview"], clock(21, "over"), true), /时间到了：只告别/);
});

test("现场卡：开场没有覆盖账；之后覆盖账是最后一行，紧贴候选人的话", () => {
  const brief = testBrief();
  const opening = renderTurnMessage({ clock: clock(0), notebook: "", opening: true, covered: [], helping: false }, null, brief);
  assert.doesNotMatch(opening, /已聊：/);
  assert.match(opening, /还没开场/);
  const running = renderTurnMessage({ clock: clock(6), notebook: "先问主循环。", opening: false, covered: ["p1-module"], helping: false }, "我负责参数校验。", brief);
  const lines = running.split("\n");
  const coverageIndex = lines.findIndex((line) => line.startsWith("已聊："));
  assert.ok(coverageIndex > 0);
  assert.equal(lines[coverageIndex + 1], "");
  assert.equal(lines[coverageIndex + 2], "候选人说：");
  assert.equal(lines.at(-1), "我负责参数校验。");
});
