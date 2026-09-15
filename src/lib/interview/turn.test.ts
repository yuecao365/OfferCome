import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { estimateClock } from "./clock";
import type { Decision } from "./decide";
import { FALLBACK_SPEECH } from "./policy";
import { applyTurn, breakerTripped, candidateWantsToEnd, planTurn, speak, type CandidateInput, type TurnState } from "./turn";
import { policyVariant } from "./variants";

/**
 * 回合核心的纯逻辑：代码守时间盒、结束按钮、决策、模型没说话时接一句、每步记事件；
 * 底线：泄露内部词、重复提问、该换题没换都改问下一份材料的切入问法；过早的"告别"不认。
 */

function state(overrides: Partial<TurnState> = {}): TurnState {
  return { brief: testBrief(), notebook: "", transcript: [], totalMinutes: 20, phase: "opening", variant: policyVariant(null), realTime: false, ...overrides };
}

const candidate = (content: string, control: CandidateInput["control"] = null): CandidateInput => ({ clientId: "c1", content, control, composeMs: null });
const line = (role: "interviewer" | "candidate", content: string, seq = 0, topic: string | null = null) => ({ seq, role, content, kind: role === "interviewer" ? "say" : null, control: null, topic });
const go: Decision = { move: "continue", reason: "顺着追" };
const out = (say: string, extra: Partial<{ notebook: string; topic: string | null; closing: boolean }> = {}) => ({ say, notebook: "n", topic: null, closing: false, ...extra });

test("候选人要结束：按钮，或 40 字内含结束意图的插话；长回答里的'结束'不算", () => {
  assert.equal(candidateWantsToEnd(candidate("", "end")), true);
  assert.equal(candidateWantsToEnd(candidate("今天就到这吧")), true);
  assert.equal(candidateWantsToEnd(candidate("我讲一下这个项目最后是怎么结束的：" + "细节".repeat(30))), false);
  assert.equal(candidateWantsToEnd(null), false);
});

test("谁做主：开场与正常回合交给模型并附决策；结束按钮、时间到了、熔断由代码收尾", () => {
  const opening = planTurn(state(), null);
  assert.equal(opening.kind, "model");
  assert.match(opening.decision.reason, /开场/);
  assert.equal(planTurn(state({ phase: "running", transcript: [line("interviewer", "你好")] }), candidate("", "end")).kind, "fixed");
  // 11 次交换、每次 600 字的回答 ≈ 31 分钟，过了 20 分钟的时间盒，也问够了标准档的 10 问。
  const long = Array.from({ length: 22 }, (_, index) => line(index % 2 ? "candidate" : "interviewer", index % 2 ? "一".repeat(600) : "问一句。", index));
  const plan = planTurn(state({ phase: "running", transcript: long }), candidate("再答一句"));
  assert.equal(plan.kind, "fixed");
  assert.equal(plan.kind === "fixed" && plan.endedBy, "budget");
  const fallback = (seq: number) => ({ seq, role: "interviewer" as const, content: "稍等。", kind: "fallback", control: null });
  assert.equal(breakerTripped([fallback(0), fallback(2), fallback(4)]), true);
  assert.equal(breakerTripped([fallback(0), line("interviewer", "问。", 2), fallback(4)]), false);
  const tripped = planTurn(state({ phase: "running", transcript: [fallback(0), fallback(2), fallback(4)] }), candidate("再答"));
  assert.equal(tripped.kind === "fixed" && tripped.endedBy, "breaker");
});

test("说话：没产出接一句；泄露内部词改问下一份材料；面试过半之前的告别不认；带问号的告别不认", () => {
  const stalled = speak(state(), estimateClock([], 20), go, null, "r1");
  assert.equal(stalled.say, FALLBACK_SPEECH.askIntro);
  assert.equal(stalled.failed, true);
  const running = state({ phase: "running" });
  const leaked = speak(running, estimateClock([], 20), go, out("按评分标准你这题算过。"), "r2");
  assert.equal(leaked.guard, "泄露内部词");
  assert.equal(leaked.say, running.brief.areas[0].entryQuestion);
  assert.equal(leaked.topic, running.brief.areas[0].id);
  assert.equal(leaked.original, "按评分标准你这题算过。");
  const early = speak(running, { usedMinutes: 3, totalMinutes: 20, exchanges: 3, phase: "open" }, go, out("这块先到这，我们换下一个话题。", { closing: true }), "r3");
  assert.equal(early.kind, "say");
  const late = speak(running, { usedMinutes: 18, totalMinutes: 20, exchanges: 14, phase: "wrap_up" }, go, out("今天就到这里，谢谢。", { closing: true }), "r4");
  assert.equal(late.kind, "closing");
  assert.equal(late.endedBy, "interviewer");
  const question = speak(running, { usedMinutes: 18, totalMinutes: 20, exchanges: 14, phase: "wrap_up" }, go, out("最后一个点：你会先抽样复核，还是先看分布？一句话说完就行。", { closing: true }), "r5");
  assert.equal(question.kind, "say");
});

test("材料自报：只认材料里有的 id；追问没报就沿用上一句的；开场不沿用", () => {
  const running = state({ phase: "running", transcript: [line("interviewer", "先讲主循环。", 0, "p1-module"), line("candidate", "答", 1)] });
  assert.equal(speak(running, estimateClock([], 20), go, out("校验不过怎么办？", { topic: "q1" }), "r").topic, "q1");
  assert.equal(speak(running, estimateClock([], 20), go, out("校验不过怎么办？", { topic: "nope" }), "r").topic, "p1-module");
  assert.equal(speak(running, estimateClock([], 20), go, out("校验不过怎么办？"), "r").topic, "p1-module");
  assert.equal(speak(state(), estimateClock([], 20), go, out("你好，先介绍一下。"), "r").topic, null);
  // 自报滞后：换了题还报上一份——这句像哪份材料的切入问法，就认那份。
  const q1 = running.brief.areas.find((area) => area.id === "q1")!;
  const corrected = speak(running, estimateClock([], 20), { move: "switch", reason: "该转基础题" }, out(`换个基础题：${q1.entryQuestion}`, { topic: "p1-module" }), "r");
  assert.equal(corrected.topic, "q1");
  assert.equal(corrected.guard, null);
});

test("底线：与前面某句几乎一样的不认；换题回合还像原话题切入问法的不认——都改问决策指的材料并记原话；换题回合没报新材料就记到决策指的那份", () => {
  const running = state({ phase: "running", transcript: [line("interviewer", "如果一个工作线程靠轮询一个退出标志位来停掉，偶发不退出，最常见的原因是什么？", 0, "q2"), line("candidate", "我不会", 1)] });
  const q1 = running.brief.areas.find((area) => area.id === "q1")!;
  const repeated = speak(running, estimateClock([], 20), go, out("那我换个基础一点的问法：如果一个工作线程靠轮询一个退出标志位来停掉，偶发不退出，最常见的原因是什么？", { topic: "q2" }), "r");
  assert.equal(repeated.guard, "重复提问");
  assert.equal(repeated.say, running.brief.areas.find((area) => area.id !== "q2")!.entryQuestion);
  assert.match(repeated.original ?? "", /换个基础一点的问法/);
  const q2 = running.brief.areas.find((area) => area.id === "q2")!;
  const stuck = speak(running, estimateClock([], 20), { move: "switch", reason: "两次答不上", next: "q1" }, out(`再试一次：${q2.entryQuestion}`, { topic: "q2" }), "r");
  assert.equal(stuck.guard, "该换题没换");
  assert.equal(stuck.say, q1.entryQuestion);
  assert.equal(stuck.topic, "q1");
  // 换了题但没报新材料 / 还报着上一份：不再误杀，记到决策指的那份名下。
  const untagged = speak(running, estimateClock([], 20), { move: "switch", reason: "两次答不上", next: "q1" }, out("那换个方向：缓存和数据库双写怎么保证一致？", { topic: "q2" }), "r");
  assert.equal(untagged.guard, null);
  assert.equal(untagged.topic, "q1");
  const moved = speak(running, estimateClock([], 20), { move: "switch", reason: "两次答不上", next: "q1" }, out("换个题：缓存和数据库双写怎么保证一致？", { topic: "q3" }), "r");
  assert.equal(moved.guard, null);
  assert.equal(moved.topic, "q3");
  const result = applyTurn(running, candidate("我不会"), { move: "switch", reason: "两次答不上", next: "q1" }, stuck);
  assert.deepEqual(result.events.map((item) => item.type), ["candidate_said", "move_decided", "interviewer_said", "notebook_written", "fallback_used", "clock_tick"]);
  const fallback = result.events.find((item) => item.type === "fallback_used");
  assert.deepEqual(fallback?.payload, { reason: "该换题没换", original: `再试一次：${q2.entryQuestion}` });
});

test("应用回合：事件按顺序（候选人的话、决策、面试官的话带材料、笔记、时钟、结束），笔记没变不写事件", () => {
  const running = state({ phase: "running", notebook: "旧笔记", transcript: [line("interviewer", "你好")] });
  const spoken = { say: "先讲项目。", kind: "say" as const, topic: "p1-module", notebook: "新笔记", failed: false, guard: null, original: null, runId: "turn:1", endedBy: null };
  const result = applyTurn(running, candidate("我叫小王", "hint"), go, spoken);
  assert.deepEqual(result.events.map((item) => item.type), ["candidate_said", "move_decided", "interviewer_said", "notebook_written", "clock_tick"]);
  const said = result.events.find((item) => item.type === "interviewer_said");
  assert.equal(said && said.type === "interviewer_said" ? said.payload.topic : null, "p1-module");
  assert.equal(result.said[0].kind, "control");
  assert.equal(result.notebook, "新笔记");
  const same = applyTurn(running, null, go, { ...spoken, notebook: "旧笔记", runId: null });
  assert.deepEqual(same.events.map((item) => item.type), ["move_decided", "interviewer_said", "clock_tick"]);
  const ended = applyTurn(running, candidate("", "end"), { move: "close", reason: "候选人要求结束" }, { say: FALLBACK_SPEECH.closing, kind: "closing", topic: null, notebook: null, failed: false, guard: null, original: null, runId: null, endedBy: "candidate" });
  assert.equal(ended.phase, "ended");
  assert.equal(ended.events.at(-1)?.type, "ended");
});
