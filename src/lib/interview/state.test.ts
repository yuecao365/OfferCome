import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { checkAction, checkReply, END_ALLOWED_AFTER, END_REQUIRED_AFTER, fallbackAction, renderOptions } from "./constraints";
import { renderState, stateOf, type Action, type Signal, type StateEvent } from "./state";

/** 重建 v5 第 2 步：状态从事件推导（材料 / 角度 / 证据账 / 候选人信号），动作约束只校验不替模型决定。 */

const brief = testBrief();
let seq = 0;
const said = (materialId: string | null, action: Action = "probe", facet: number | null = null): StateEvent => ({ type: "interviewer_said", seq: seq++, action, materialId, facet });
const answered = (signal: Signal | null = "answered", control: "hint" | "skip" | "repeat" | "end" | null = null): StateEvent => ({ type: "candidate_said", seq: seq++, signal, control });
const ledger = (materialId: string, text: string): StateEvent => ({ type: "ledger_written", seq: seq++, materialId, text });

test("状态：开场 → 进材料变 open，追问计数、角度计数与讲透，换材料时上一份变 done，证据账挂到材料上", () => {
  const events: StateEvent[] = [said(null, "probe"), answered(), said("p1-overview", "switch"), answered(), ledger("p1-overview", "整体架构讲清了"), said("p1-overview", "probe", 0), answered("thin"), said("p1-overview", "probe", 0), answered(), said("p1-overview", "clarify"), answered("help"), said("q1", "switch"), answered()];
  const state = stateOf(brief, events);
  assert.equal(state.phase, "running");
  assert.equal(state.turn, 6);
  const p1 = state.materials.find((item) => item.id === "p1-overview")!;
  assert.equal(p1.status, "done", "换到 q1 后 p1 聊完了");
  assert.equal(p1.asked, 3, "switch 那句 + 两句 probe；clarify 不占预算");
  assert.deepEqual(p1.facets.map((facet) => [facet.probes, facet.status]), [[2, "done"], [0, "untouched"]]);
  assert.deepEqual(p1.ledger.map((item) => item.text), ["整体架构讲清了"]);
  assert.equal(state.currentId, "q1");
  assert.equal(state.materials.find((item) => item.id === "q1")!.status, "open");
  assert.equal(state.candidate.helpCount, 1);
  assert.equal(state.candidate.noInfoStreak, 0);
  const rendered = renderState(state);
  assert.match(rendered, /\[p1-overview\] 项目「[^」]+」：聊完了，问了 3 \/ 4 句/);
  assert.match(rendered, /角度：1\. 工具链路（讲透了）；2\. 安全链路（没问）/);
  assert.match(rendered, /证据账：整体架构讲清了/);
  assert.match(rendered, /\[q2\] 基础题「[^」]+」：还没聊，可问 2 句。切入问法：/);
});

test("候选人信号：没信息的三类连续计数，答上了归零；跳过让当前材料 skipped；要结束记 wantsToEnd", () => {
  const base: StateEvent[] = [said(null), answered(), said("p1-overview", "switch"), answered("dont_know"), said("p1-overview", "clarify"), answered("not_mine"), said("q1", "switch"), answered("refuse")];
  const state = stateOf(brief, base);
  assert.equal(state.candidate.noInfoStreak, 3);
  assert.equal(state.candidate.noInfoTotal, 3);
  const recovered = stateOf(brief, [...base, said("q1", "probe"), answered("answered")]);
  assert.equal(recovered.candidate.noInfoStreak, 0);
  const skipped = stateOf(brief, [...base, answered(null, "skip")]);
  assert.equal(skipped.materials.find((item) => item.id === "q1")!.status, "skipped");
  assert.equal(stateOf(brief, [...base, answered(null, "end")]).candidate.wantsToEnd, true);
  assert.equal(stateOf(brief, [...base, answered("wants_end")]).candidate.wantsToEnd, true);
});

test("约束：预算、角度上限、不切回聊过的材料、收尾门槛（连续 3 句可收、6 句必收、候选人要结束必收）", () => {
  const events: StateEvent[] = [said(null), answered(), said("p1-overview", "switch"), answered()];
  const state = stateOf(brief, events);
  assert.deepEqual(checkAction(state, { action: "probe", target: "p1-overview", facet: 0 }), { ok: true });
  assert.match((checkAction(state, { action: "probe", target: "p1-overview", facet: null }) as { reason: string }).reason, /角度序号/);
  assert.match((checkAction(state, { action: "end", target: null, facet: null }) as { reason: string }).reason, /还不能收尾/);
  assert.match((checkAction(state, { action: "switch", target: "nope", facet: null }) as { reason: string }).reason, /必须是材料 id/);
  const twice = stateOf(brief, [...events, said("p1-overview", "probe", 0), answered(), said("p1-overview", "probe", 0), answered()]);
  assert.match((checkAction(twice, { action: "probe", target: "p1-overview", facet: 0 }) as { reason: string }).reason, /已追满/);
  assert.deepEqual(checkAction(twice, { action: "probe", target: "p1-overview", facet: 1 }), { ok: true });
  const full = stateOf(brief, [...events, said("p1-overview", "probe", 0), answered(), said("p1-overview", "probe", 1), answered(), said("p1-overview", "probe", 1), answered()]);
  assert.match((checkAction(full, { action: "probe", target: "p1-overview", facet: 1 }) as { reason: string }).reason, /已问满 4 句/);
  const moved = stateOf(brief, [...events, said("q1", "switch"), answered()]);
  assert.match((checkAction(moved, { action: "switch", target: "p1-overview", facet: null }) as { reason: string }).reason, /聊过了/);
  const dry = stateOf(brief, [...events, ...Array.from({ length: END_ALLOWED_AFTER }, () => [said("p1-overview", "clarify"), answered("dont_know")]).flat()]);
  assert.deepEqual(checkAction(dry, { action: "end", target: null, facet: null }), { ok: true }, "连续 3 句没信息可以收尾");
  assert.deepEqual(checkAction(dry, { action: "switch", target: "q1", facet: null }), { ok: true }, "也可以换材料");
  const exhausted = stateOf(brief, [...events, ...Array.from({ length: END_REQUIRED_AFTER }, () => [said("p1-overview", "clarify"), answered("dont_know")]).flat()]);
  assert.match((checkAction(exhausted, { action: "switch", target: "q1", facet: null }) as { reason: string }).reason, /必须是告别/);
  assert.deepEqual(fallbackAction(exhausted), { action: "end", target: null, facet: null });
  const wants = stateOf(brief, [...events, answered(null, "end")]);
  assert.match((checkAction(wants, { action: "probe", target: "p1-overview", facet: 0 }) as { reason: string }).reason, /候选人已表示要结束/);
});

test("代码定动作与可选项：没问够先 probe（项目取第一个没追满的角度），有没聊的就 switch，都没了 end；话里带内部词不认", () => {
  const events: StateEvent[] = [said(null), answered(), said("p1-overview", "switch"), answered(), said("p1-overview", "probe", 0), answered(), said("p1-overview", "probe", 0), answered()];
  const state = stateOf(brief, events);
  assert.deepEqual(fallbackAction(state), { action: "probe", target: "p1-overview", facet: 1 });
  assert.match(renderOptions(state), /probe：接着问「[^」]+」的角度 2（安全链路）（这份材料还能问 1 句）；clarify/);
  assert.match(renderOptions(state), /switch：换到 p1-module/);
  assert.doesNotMatch(renderOptions(state), /end：/);
  const all = stateOf(brief, [said(null), answered(), ...brief.areas.flatMap((area) => [said(area.id, "switch"), answered()])]);
  const last = stateOf(brief, [said(null), answered(), ...brief.areas.slice(0, -1).flatMap((area) => [said(area.id, "switch"), answered()]), said("s1", "switch"), answered(), said("s1", "probe"), answered(), said("s1", "probe"), answered()]);
  assert.equal(fallbackAction(last).action, "end", "全部聊完且最后一份问满 → end");
  assert.equal(all.materials.every((item) => item.status !== "untouched"), true);
  assert.equal(checkReply("你刚才说的和评分标准不符").ok, false);
  assert.equal(checkReply("你刚才说的和简历上写的不一样").ok, true);
});
