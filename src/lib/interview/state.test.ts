import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { checkAction, checkReply, END_REQUIRED_AFTER, fallbackAction } from "./constraints";
import { renderState, stateOf, type Action, type Signal, type StateEvent } from "./state";

/** 状态从事件推导（材料 / 角度 / 证据账 / 候选人信号 / 时间）；代码只守动作底线，句数与角度是给模型看的信号（agent-freedom-plan）。 */

const brief = testBrief();
let seq = 0;
const said = (materialId: string | null, action: Action = "probe", facet: string | number | null = null): StateEvent => ({ type: "interviewer_said", seq: seq++, action, materialId, facet });
const answered = (signal: Signal | null = "answered", control: "hint" | "skip" | "repeat" | "end" | null = null): StateEvent => ({ type: "candidate_said", seq: seq++, signal, control });
const notes = (content: string): StateEvent => ({ type: "notes_written", seq: seq++, content });

test("状态：开场 → 进材料变 open，追问计数、角度按文字归并计数（旧下标也认），换材料时上一份变 done，笔记取最新一版", () => {
  const events: StateEvent[] = [said(null, "probe"), answered(), said("p1-overview", "switch"), answered(), notes("## 待验证\n（空）\n## 已有结论\n- 整体架构讲清了\n## 存疑\n（无）\n## 接下来\n- 追工具链路"), said("p1-overview", "probe", "工具链路"), answered("thin"), said("p1-overview", "probe", 0), answered(), said("p1-overview", "clarify"), answered("help"), said("q1", "switch"), answered()];
  const state = stateOf(brief, events);
  assert.equal(state.phase, "running");
  assert.equal(state.turn, 6);
  const p1 = state.materials.find((item) => item.id === "p1-overview")!;
  assert.equal(p1.status, "done", "换到 q1 后 p1 聊完了");
  assert.equal(p1.asked, 3, "switch 那句 + 两句 probe；clarify 不占预算");
  assert.deepEqual(p1.facets.map((facet) => [facet.text, facet.probes]), [["工具链路", 2], ["安全链路", 0]], "文字与旧下标指向同一角度");
  assert.match(state.notes, /整体架构讲清了/, "笔记是最新一版");
  assert.equal(state.currentId, "q1");
  assert.equal(state.materials.find((item) => item.id === "q1")!.status, "open");
  assert.equal(state.candidate.helpCount, 1);
  assert.equal(state.candidate.noInfoStreak, 0);
  const rendered = renderState(state);
  assert.match(rendered, /\[p1-overview\] 项目「[^」]+」：聊过了，问了 3 句（一般 4 句左右）/);
  assert.match(rendered, /已追的角度：工具链路（2 句）$/m, "没追过的角度不重印，议程里有");
  assert.match(rendered, /^主线：$/m);
  assert.match(rendered, /笔记里待验证的说法还剩 0 条/);
  assert.doesNotMatch(rendered, /整体架构讲清了/, "笔记不在 renderState 里，由 renderCard 另放一块");
  assert.match(rendered, /\[q2\] 基础题「[^」]+」：还没聊$/m);
  assert.doesNotMatch(rendered, /可选动作|余额|可问/, "状态卡只写局面，不写许可");
  const gained = stateOf(brief, [said(null), { type: "candidate_said", seq: 90, signal: "answered", control: null, content: "我用 Redis 做缓存，QPS 3000" }, said("q1", "switch"), { type: "candidate_said", seq: 91, signal: "answered", control: null, content: "还是 Redis，QPS 3000" }]);
  assert.deepEqual(gained.recentGain, [5, 1], "第二句只有「还是」是新词");
  assert.match(renderState(gained), /最近 2 句回答的新信息量[^：]*：5 \/ 1/);
  assert.doesNotMatch(rendered, /切入问法/, "切入问法在议程里，状态卡不重印");
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

test("底线：候选人要结束必收、连续 10 句没信息必收；switch 目标必须存在且不是候选人跳过的；probe / clarify 要有当前材料；其余都放行", () => {
  const events: StateEvent[] = [said(null), answered(), said("p1-overview", "switch"), answered()];
  const state = stateOf(brief, events);
  assert.deepEqual(checkAction(state, { action: "probe", target: "p1-overview", facet: "工具链路" }), { ok: true });
  assert.deepEqual(checkAction(state, { action: "probe", target: "p1-overview", facet: null }), { ok: true }, "角度不是硬要求");
  assert.deepEqual(checkAction(state, { action: "end", target: null, facet: null }), { ok: true }, "什么时候收尾由模型定");
  assert.match((checkAction(state, { action: "switch", target: "nope", facet: null }) as { reason: string }).reason, /必须是材料 id/);
  const many = stateOf(brief, [...events, ...Array.from({ length: 6 }, () => [said("p1-overview", "probe", "工具链路"), answered()]).flat()]);
  assert.deepEqual(checkAction(many, { action: "probe", target: "p1-overview", facet: "工具链路" }), { ok: true }, "句数与角度不设上限");
  const moved = stateOf(brief, [...events, said("q1", "switch"), answered()]);
  assert.deepEqual(checkAction(moved, { action: "switch", target: "p1-overview", facet: null }), { ok: true }, "可以切回聊过的材料");
  const skipped = stateOf(brief, [...events, answered(null, "skip"), said("q1", "switch"), answered()]);
  assert.match((checkAction(skipped, { action: "switch", target: "p1-overview", facet: null }) as { reason: string }).reason, /主动跳过/);
  const dry = stateOf(brief, [...events, ...Array.from({ length: 3 }, () => [said("p1-overview", "clarify"), answered("dont_know")]).flat()]);
  assert.deepEqual(checkAction(dry, { action: "probe", target: "p1-overview", facet: null }), { ok: true }, "三句没信息只是信号，不强制");
  const exhausted = stateOf(brief, [...events, ...Array.from({ length: END_REQUIRED_AFTER }, () => [said("p1-overview", "clarify"), answered("dont_know")]).flat()]);
  assert.match((checkAction(exhausted, { action: "switch", target: "q1", facet: null }) as { reason: string }).reason, /必须是告别/);
  assert.deepEqual(fallbackAction(exhausted), { action: "end", target: null, facet: null });
  const wants = stateOf(brief, [...events, answered(null, "end")]);
  assert.match((checkAction(wants, { action: "probe", target: "p1-overview", facet: null }) as { reason: string }).reason, /候选人已表示要结束/);
  const opening = stateOf(brief, [said(null), answered()]);
  assert.match((checkAction(opening, { action: "probe", target: null, facet: null }) as { reason: string }).reason, /先用 switch/);
});

test("代码定动作：有当前材料就接着问，没有就切第一份没聊的，都没了 end；话里带内部词不认", () => {
  const events: StateEvent[] = [said(null), answered(), said("p1-overview", "switch"), answered(), said("p1-overview", "probe", "工具链路"), answered()];
  const state = stateOf(brief, events);
  assert.deepEqual(fallbackAction(state), { action: "probe", target: "p1-overview", facet: null });
  assert.deepEqual(fallbackAction(stateOf(brief, [said(null), answered()])), { action: "switch", target: "p1-overview", facet: null });
  const all = stateOf(brief, [said(null), answered(), ...brief.areas.flatMap((area) => [said(area.id, "switch"), answered()]), said("s1", "end")]);
  assert.equal(fallbackAction(all).action, "end", "收尾后没有当前材料、没有没聊的 → end");
  assert.equal(all.materials.every((item) => item.status !== "untouched"), true);
  assert.equal(checkReply("你刚才说的和评分标准不符").ok, false);
  assert.equal(checkReply("你刚才说的和简历上写的不一样").ok, true);
});
