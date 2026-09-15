import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { estimateClock } from "./clock";
import { FALLBACK_SPEECH } from "./policy";
import { applyTurn, breakerTripped, candidateWantsToEnd, planTurn, speak, type CandidateInput, type TurnState } from "./turn";
import { policyVariant } from "./variants";

/**
 * 回合核心的纯逻辑：代码只守时间盒、结束按钮、模型没说话时接一句、每步记事件；
 * 泄露内部词的话换成固定的话；过早的"告别"不认。
 */

function state(overrides: Partial<TurnState> = {}): TurnState {
  return { brief: testBrief(), notebook: "", transcript: [], totalMinutes: 20, phase: "opening", covered: [], estimates: [], critic: null, variant: policyVariant(null), realTime: null, ...overrides };
}

const candidate = (content: string, control: CandidateInput["control"] = null): CandidateInput => ({ clientId: "c1", content, control, composeMs: null });
const line = (role: "interviewer" | "candidate", content: string, seq = 0) => ({ seq, role, content, kind: role === "interviewer" ? "say" : null, control: null });

test("候选人要结束：按钮，或 40 字内含结束意图的插话；长回答里的'结束'不算", () => {
  assert.equal(candidateWantsToEnd(candidate("", "end")), true);
  assert.equal(candidateWantsToEnd(candidate("今天就到这吧")), true);
  assert.equal(candidateWantsToEnd(candidate("我讲一下这个项目最后是怎么结束的：" + "细节".repeat(30))), false);
  assert.equal(candidateWantsToEnd(null), false);
});

test("谁做主：开场与正常回合交给模型；结束按钮与时间到了由代码收尾", () => {
  assert.equal(planTurn(state(), null).kind, "model");
  assert.equal(planTurn(state({ phase: "running", transcript: [line("interviewer", "你好")] }), candidate("", "end")).kind, "fixed");
  // 11 次交换、每次 600 字的回答 ≈ 31 分钟，过了 20 分钟的时间盒，也问够了标准档的 10 问。
  const long = Array.from({ length: 22 }, (_, index) => line(index % 2 ? "candidate" : "interviewer", index % 2 ? "一".repeat(600) : "问一句。", index));
  const plan = planTurn(state({ phase: "running", transcript: long }), candidate("再答一句"));
  assert.equal(plan.kind, "fixed");
  assert.equal(plan.kind === "fixed" && plan.endedBy, "budget");
  // 熔断：连续三句都是代码接的话就不再调模型。
  const fallback = (seq: number) => ({ seq, role: "interviewer" as const, content: "稍等。", kind: "fallback", control: null });
  assert.equal(breakerTripped([fallback(0), fallback(2), fallback(4)]), true);
  assert.equal(breakerTripped([fallback(0), line("interviewer", "问。", 2), fallback(4)]), false);
  const tripped = planTurn(state({ phase: "running", transcript: [fallback(0), fallback(2), fallback(4)] }), candidate("再答"));
  assert.equal(tripped.kind === "fixed" && tripped.endedBy, "breaker");
});

test("说话：没产出接一句；泄露内部词换固定的话；面试过半之前的告别不认", () => {
  const opening = state();
  const stalled = speak(opening, estimateClock([], 20), null, "r1", 0);
  assert.equal(stalled.say, FALLBACK_SPEECH.askIntro);
  assert.equal(stalled.failed, true);
  const running = state({ phase: "running" });
  const leaked = speak(running, estimateClock([], 20), { say: "按评分标准你这题算过。", notebook: "n", closing: false }, "r2", 0);
  assert.equal(leaked.say, FALLBACK_SPEECH.stall);
  const early = speak(running, { usedMinutes: 3, totalMinutes: 20, exchanges: 3, phase: "open" }, { say: "这块先到这，我们换下一个话题。", notebook: "n", closing: true }, "r3", 0);
  assert.equal(early.kind, "say");
  assert.equal(early.endedBy, null);
  const late = speak(running, { usedMinutes: 18, totalMinutes: 20, exchanges: 14, phase: "wrap_up" }, { say: "今天就到这里，谢谢。", notebook: "n", closing: true }, "r4", 1);
  assert.equal(late.kind, "closing");
  assert.equal(late.endedBy, "interviewer");
  // 以问号结尾的"告别"其实是最后一问：不认，候选人还要答。
  const question = speak(running, { usedMinutes: 18, totalMinutes: 20, exchanges: 14, phase: "wrap_up" }, { say: "最后一个点：你会先抽样复核，还是先看分布？一句话说完就行。", notebook: "n", closing: true }, "r5", 0);
  assert.equal(question.kind, "say");
  assert.equal(question.endedBy, null);
});

test("应用回合：事件按顺序（候选人的话、面试官的话、笔记、时钟、结束），笔记没变不写事件", () => {
  const running = state({ phase: "running", notebook: "旧笔记", transcript: [line("interviewer", "你好")] });
  const result = applyTurn(running, candidate("我叫小王", "hint"), { say: "先讲项目。", kind: "say", notebook: "新笔记", failed: false, runId: "turn:1", skillsLoaded: 0, endedBy: null });
  assert.deepEqual(result.events.map((item) => item.type), ["candidate_said", "interviewer_said", "notebook_written", "clock_tick"]);
  assert.equal(result.said[0].kind, "control");
  assert.equal(result.notebook, "新笔记");
  assert.equal(result.phase, "running");
  const same = applyTurn(running, null, { say: "再问一句。", kind: "say", notebook: "旧笔记", failed: false, runId: null, skillsLoaded: 0, endedBy: null });
  assert.deepEqual(same.events.map((item) => item.type), ["interviewer_said", "clock_tick"]);
  const ended = applyTurn(running, candidate("", "end"), { say: FALLBACK_SPEECH.closing, kind: "closing", notebook: null, failed: false, runId: null, skillsLoaded: 0, endedBy: "candidate" });
  assert.equal(ended.phase, "ended");
  assert.equal(ended.events.at(-1)?.type, "ended");
});
