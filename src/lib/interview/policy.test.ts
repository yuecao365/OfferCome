import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { buildSystem, renderCoverage, renderTurnMessage } from "./policy";

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
  const opening = renderTurnMessage({ clock: clock(0), notebook: "", opening: true, covered: [], helping: false, estimate: null, critic: null }, null, brief);
  assert.doesNotMatch(opening, /已聊：/);
  assert.match(opening, /还没开场/);
  const running = renderTurnMessage({ clock: clock(6), notebook: "先问主循环。", opening: false, covered: ["p1-module"], helping: false, estimate: null, critic: null }, "我负责参数校验。", brief);
  const lines = running.split("\n");
  const coverageIndex = lines.findIndex((line) => line.startsWith("已聊："));
  assert.ok(coverageIndex > 0);
  // 估计器的一行放在覆盖账之前；没有能力清单时不出现。
  assert.doesNotMatch(running, /能力估计：/);
  const estimated = renderTurnMessage({ clock: clock(6), notebook: "n", opening: false, covered: [], helping: false, estimate: "能力估计：最值得追：系统可靠性（估计 中，置信 低，岗位权重 高）。", critic: null }, "答。", brief).split("\n");
  const estimateIndex = estimated.findIndex((line) => line.startsWith("能力估计："));
  assert.ok(estimateIndex > 0 && estimateIndex < estimated.findIndex((line) => line.startsWith("已聊：")));
  // 评论员的提醒在能力估计之后、覆盖账之前；没有就不出现。
  const criticized = renderTurnMessage({ clock: clock(6), notebook: "n", opening: false, covered: [], helping: false, estimate: null, critic: "上一句问了两个要点，这句只问一个" }, "答。", brief);
  assert.match(criticized, /评论员对你上一句的提醒：上一句问了两个要点/);
  assert.ok(criticized.indexOf("评论员") < criticized.indexOf("已聊："));
  assert.doesNotMatch(running, /评论员/);
  assert.equal(lines[coverageIndex + 1], "");
  assert.equal(lines[coverageIndex + 2], "候选人说：");
  assert.equal(lines.at(-1), "我负责参数校验。");
});

test("系统提示词：有上几场的记忆才有记忆段与说法历史；没有就不出现", () => {
  const brief = testBrief({ hypotheses: [{ id: "h1", text: "验证压测", evidence: "压测 QPS 提升 3 倍", projectId: "proj-1" }] });
  const context = { jobTitle: "后端", jobDescription: "JD", resumeText: "简历", totalMinutes: 20, skillPacks: [] };
  assert.doesNotMatch(buildSystem(brief, context), /上几场的记忆/);
  const memory = { sessions: 1, claims: [{ text: "验证压测", evidence: "压测 QPS 提升 3 倍", status: "refuted" as const, note: "没有讲清楚", at: "2026-09-01T00:00:00Z" }], competencies: [], weaknesses: [{ point: "只说了名词", quote: null, areaName: "缓存", at: "2026-09-01T00:00:00Z" }], askedQuestions: [] };
  const system = buildSystem(brief, { ...context, memory });
  assert.match(system, /上几场的记忆（同一位候选人，最近 1 场/);
  assert.match(system, /「压测 QPS 提升 3 倍」：上次没讲清：没有讲清楚/);
  assert.match(system, /缓存：只说了名词/);
});

