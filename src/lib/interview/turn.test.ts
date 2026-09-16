import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import type { Decision } from "./decide";
import { FALLBACK_SPEECH } from "./policy";
import { planQuota } from "./progress";
import { applyTurn, breakerTripped, candidateWantsToEnd, planTurn, speak, type CandidateInput, type TurnState } from "./turn";
import { policyVariant } from "./variants";

/**
 * 回合核心的纯逻辑：代码守配额、结束按钮、决策、模型没说话时接一句、每步记事件；
 * 材料与角度由代码指派；模型只判"讲透了没有"；底线：泄露内部词、重复提问、该换题没换都改问下一份材料的切入问法；决策没允许的"告别"不认。
 */

function state(overrides: Partial<TurnState> = {}): TurnState {
  return { brief: testBrief(), notebook: "", transcript: [], phase: "opening", variant: policyVariant(null), seed: "s", ...overrides };
}

const candidate = (content: string, control: CandidateInput["control"] = null): CandidateInput => ({ clientId: "c1", content, control, composeMs: null });
const line = (role: "interviewer" | "candidate", content: string, seq = 0, topic: string | null = null, facet: number | null = null) => ({ seq, role, content, kind: role === "interviewer" ? "say" : null, control: null, topic, facet, doneFacet: null });
const go: Decision = { move: "continue", reason: "顺着追", target: { topic: "p1-overview", facet: 0 } };
const out = (say: string, extra: Partial<{ notebook: string; facetDone: boolean; closing: boolean }> = {}) => ({ say, notebook: "n", facetDone: false, closing: false, ...extra });

/** 把计划里的材料全部按预算问完的逐字稿。 */
function exhausted(): ReturnType<typeof line>[] {
  const lines: ReturnType<typeof line>[] = [line("interviewer", "你好", 0), line("candidate", "我叫小王", 1)];
  for (const item of planQuota(testBrief())) {
    for (let index = 0; index < item.budget; index += 1) {
      lines.push(line("interviewer", `${item.id} 问 ${index}？`, lines.length, item.id, index === 0 ? null : 0));
      lines.push(line("candidate", "答", lines.length));
    }
  }
  return lines;
}

test("候选人要结束：按钮，或 40 字内含结束意图的插话；长回答里的'结束'不算", () => {
  assert.equal(candidateWantsToEnd(candidate("", "end")), true);
  assert.equal(candidateWantsToEnd(candidate("今天就到这吧")), true);
  assert.equal(candidateWantsToEnd(candidate("我讲一下这个项目最后是怎么结束的：" + "细节".repeat(30))), false);
  assert.equal(candidateWantsToEnd(null), false);
});

test("谁做主：开场与正常回合交给模型并附决策；结束按钮、配额聊完、熔断由代码收尾", () => {
  const opening = planTurn(state(), null);
  assert.equal(opening.kind, "model");
  assert.match(opening.decision.reason, /开场/);
  assert.equal(planTurn(state({ phase: "running", transcript: [line("interviewer", "你好")] }), candidate("", "end")).kind, "fixed");
  const plan = planTurn(state({ phase: "running", transcript: exhausted() }), candidate("再答一句"));
  assert.equal(plan.kind, "fixed");
  assert.equal(plan.kind === "fixed" && plan.endedBy, "budget");
  assert.equal(plan.progress.covered, 6);
  const fallback = (seq: number) => ({ seq, role: "interviewer" as const, content: "稍等。", kind: "fallback", control: null });
  assert.equal(breakerTripped([fallback(0), fallback(2), fallback(4)]), true);
  assert.equal(breakerTripped([fallback(0), line("interviewer", "问。", 2), fallback(4)]), false);
  const tripped = planTurn(state({ phase: "running", transcript: [fallback(0), fallback(2), fallback(4)] }), candidate("再答"));
  assert.equal(tripped.kind === "fixed" && tripped.endedBy, "breaker");
});

test("说话：没产出接一句；泄露内部词改问下一份材料；告别只认决策允许的那种，带问号的不认", () => {
  const stalled = speak(state(), go, null, "r1");
  assert.equal(stalled.say, FALLBACK_SPEECH.askIntro);
  assert.equal(stalled.failed, true);
  const running = state({ phase: "running", transcript: [line("interviewer", "你好", 0), line("candidate", "我叫小王", 1)] });
  const leaked = speak(running, go, out("按评分标准你这题算过。"), "r2");
  assert.equal(leaked.guard, "泄露内部词");
  assert.equal(leaked.say, running.brief.areas[0].entryQuestion);
  assert.deepEqual(leaked.target, { topic: "p1-overview", facet: null });
  assert.equal(leaked.original, "按评分标准你这题算过。");
  const notAllowed = speak(running, go, out("这块先到这，我们换下一个话题。", { closing: true }), "r3");
  assert.equal(notAllowed.kind, "say");
  const allowed: Decision = { move: "continue", reason: "讲透了就告别", target: { topic: "s1", facet: 0 }, ifDone: null };
  const late = speak(running, allowed, out("今天就到这里，谢谢。", { closing: true, facetDone: true }), "r4");
  assert.equal(late.kind, "closing");
  assert.equal(late.endedBy, "interviewer");
  const question = speak(running, allowed, out("最后一个点：你会先抽样复核，还是先看分布？", { closing: true, facetDone: true }), "r5");
  assert.equal(question.kind, "say");
  assert.equal(speak(running, allowed, out("今天就到这里，谢谢。", { closing: true, facetDone: false }), "r6").kind, "say", "没说讲透就不能告别");
});

test("材料与角度由代码指派：模型说讲透了就按决策的另一边记，并记下讲透的角度；开场不记材料", () => {
  const running = state({ phase: "running", transcript: [line("interviewer", "先讲主循环。", 0, "p1-overview", null), line("candidate", "答", 1)] });
  const decision: Decision = { move: "continue", reason: "", target: { topic: "p1-overview", facet: 0 }, ifDone: { topic: "p1-overview", facet: 1 } };
  const same = speak(running, decision, out("工具链路里你负责哪段？"), "r");
  assert.deepEqual(same.target, { topic: "p1-overview", facet: 0 });
  assert.equal(same.doneFacet, null);
  const moved = speak(running, decision, out("安全链路怎么做的？", { facetDone: true }), "r");
  assert.deepEqual(moved.target, { topic: "p1-overview", facet: 1 });
  assert.equal(moved.doneFacet, 0);
  const ignored = speak(running, { move: "continue", reason: "", target: { topic: "p1-overview", facet: 0 } }, out("再问一句？", { facetDone: true }), "r");
  assert.deepEqual(ignored.target, { topic: "p1-overview", facet: 0 }, "决策没问模型的判断时 facetDone 不起作用");
  assert.equal(speak(state(), go, out("你好，先介绍一下。"), "r").target, null);
  const aside = speak(running, { move: "clarify", reason: "答疑", target: { topic: "p1-overview", facet: null } }, out("我换个说法：你负责的那段主循环，输入是什么？"), "r");
  assert.equal(aside.kind, "aside");
  assert.deepEqual(aside.target, { topic: "p1-overview", facet: null });
});

test("底线：与前面某句几乎一样的不认；换材料的回合还像原材料切入问法的不认——都改问决策指的材料并记原话", () => {
  const q1 = testBrief().areas.find((area) => area.id === "q1")!;
  const q2 = testBrief().areas.find((area) => area.id === "q2")!;
  const running = state({ phase: "running", transcript: [line("interviewer", q1.entryQuestion, 0, "q1"), line("candidate", "我不会", 1)] });
  const repeated = speak(running, { move: "continue", reason: "", target: { topic: "q1", facet: null } }, out(`再问一遍：${q1.entryQuestion}`), "r");
  assert.equal(repeated.guard, "重复提问");
  assert.equal(repeated.say, q2.entryQuestion, "追问的回合改问计划里的下一份");
  assert.deepEqual(repeated.target, { topic: "q2", facet: null });
  assert.match(repeated.original ?? "", /^再问一遍：/);
  const toQ2: Decision = { move: "switch", reason: "两次答不上", target: { topic: "q2", facet: null } };
  const stuck = speak(running, toQ2, out(q1.entryQuestion.replace("最关键的一个机制", "关键机制")), "r");
  assert.equal(stuck.guard, "该换题没换");
  assert.equal(stuck.say, q2.entryQuestion);
  assert.deepEqual(stuck.target, { topic: "q2", facet: null });
  const moved = speak(running, toQ2, out("换个题：索引失效常见的原因是什么？"), "r");
  assert.equal(moved.guard, null);
  assert.deepEqual(moved.target, { topic: "q2", facet: null });
  const result = applyTurn(running, candidate("我不会"), toQ2, stuck);
  assert.deepEqual(result.events.map((item) => item.type), ["candidate_said", "move_decided", "interviewer_said", "notebook_written", "fallback_used", "progress_tick"]);
  const fallback = result.events.find((item) => item.type === "fallback_used");
  assert.deepEqual(fallback?.payload, { reason: "该换题没换", original: q1.entryQuestion.replace("最关键的一个机制", "关键机制") });
});

test("应用回合：事件按顺序（候选人的话、决策、面试官的话带材料与角度、笔记、进度、结束），笔记没变不写事件", () => {
  const running = state({ phase: "running", notebook: "旧笔记", transcript: [line("interviewer", "你好")] });
  const spoken = { say: "先讲项目。", kind: "say" as const, target: { topic: "p1-overview", facet: null }, doneFacet: null, notebook: "新笔记", failed: false, guard: null, original: null, runId: "turn:1", endedBy: null };
  const result = applyTurn(running, candidate("我叫小王", "hint"), go, spoken);
  assert.deepEqual(result.events.map((item) => item.type), ["candidate_said", "move_decided", "interviewer_said", "notebook_written", "progress_tick"]);
  const said = result.events.find((item) => item.type === "interviewer_said");
  assert.deepEqual(said && said.type === "interviewer_said" ? [said.payload.topic, said.payload.facet, said.payload.doneFacet] : null, ["p1-overview", null, null]);
  assert.deepEqual(result.progress, { covered: 1, quota: 6 });
  assert.equal(result.said[0].kind, "control");
  assert.equal(result.said[1].topic, "p1-overview");
  assert.equal(result.notebook, "新笔记");
  const same = applyTurn(running, null, go, { ...spoken, notebook: "旧笔记", runId: null });
  assert.deepEqual(same.events.map((item) => item.type), ["move_decided", "interviewer_said", "progress_tick"]);
  const ended = applyTurn(running, candidate("", "end"), { move: "close", reason: "候选人要求结束", target: null }, { say: FALLBACK_SPEECH.closing, kind: "closing", target: null, doneFacet: null, notebook: null, failed: false, guard: null, original: null, runId: null, endedBy: "candidate" });
  assert.equal(ended.phase, "ended");
  assert.equal(ended.events.at(-1)?.type, "ended");
});
