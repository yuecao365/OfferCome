import assert from "node:assert/strict";
import test from "node:test";

import type { AiTaskConfig } from "@/lib/ai/config";
import { testBrief } from "@/lib/test-support/interview-brief";

import type { InterviewEvent } from "./events";
import type { InterviewerCall, InterviewerOutput } from "./interviewer";
import { scriptInterviewer } from "./eval/script-policy";
import { initialNotes } from "./notes";
import { resolveTarget, runTurn, toolUsesOf, type CandidateInput, type Interviewer, type TurnState } from "./turn";

/**
 * 回合核心（重建 v5 §3）：模型提动作、代码只校验；违约退回重出一次，仍违约代码定动作再说一次；
 * 文字只查内部词；笔记只查格式；结束按钮不调模型；事件里带 signal / action，笔记单独落事件。面试官用桩注入。
 */

const config = { task: "text", provider: "openai", model: "gpt-test", baseURL: null, apiKey: "k", requiresApiKey: true } as AiTaskConfig;
const context = { jobTitle: "Agent 开发", jobDescription: "JD", resumeText: "简历" };

let seq = 0;
const said = (content: string, extra: Partial<{ topic: string | null; facet: number | null; action: InterviewerOutput["action"]; kind: string }> = {}): InterviewEvent => ({ seq: seq++, type: "interviewer_said", payload: { content, kind: extra.kind ?? "say", topic: extra.topic ?? null, facet: extra.facet ?? null, action: extra.action ?? null }, runId: null, at: new Date() });
const answered = (content: string, signal: InterviewerOutput["signal"] | null = "answered"): InterviewEvent => ({ seq: seq++, type: "candidate_said", payload: { content, clientId: null, control: null, composeMs: null, signal }, runId: null, at: new Date() });
const candidate = (content: string, control: CandidateInput["control"] = null): CandidateInput => ({ clientId: "c1", content, control, composeMs: null });
const NOTES = initialNotes(testBrief());
const out = (reply: string, extra: Partial<InterviewerOutput> = {}): InterviewerOutput => ({ signal: "answered", action: "probe", target: null, facet: null, notes: NOTES, reply, ...extra });

/** 桩：按队列吐产出，记下每次收到的状态卡与 runId。 */
function stub(outputs: InterviewerOutput[]) {
  const calls: InterviewerCall[] = [];
  const interviewer: Interviewer = async (input) => {
    calls.push(input);
    const output = outputs.shift();
    if (!output) throw new Error("模型没有产出");
    return { output, partial: false, runId: input.runId, provider: "openai", model: "gpt-test", durationMs: 0, steps: 1, toolCalls: [], events: [] };
  };
  return { interviewer, calls };
}

function state(events: InterviewEvent[]): TurnState {
  return { brief: testBrief(), events, phase: events.length === 0 ? "opening" : "running" };
}

const opened = () => [said("你好，先介绍一下自己。"), answered("我叫小王")];
const inProject = () => [...opened(), said("先聊第一个项目：整体架构？", { topic: "p1-overview", action: "switch" }), answered("主循环是我写的")];

test("开场：不管模型填什么动作都按 probe 记；只有一条 interviewer_said，没有证据账", async () => {
  const { interviewer, calls } = stub([out("你好，先介绍一下自己。", { action: "end" })]);
  const result = await runTurn({ runId: "t:1", config, state: state([]), candidate: null, context, interviewer });
  assert.deepEqual(result.events.map((item) => item.type), ["interviewer_said", "notes_written"]);
  assert.equal(result.said[0].action, "probe");
  assert.equal(result.phase, "running");
  assert.equal(calls.length, 1, "开场固定 probe，不算违约");
  assert.equal(result.progress.quota, 7);
});

test("正常回合：候选人那句带模型判的 signal，面试官那句带 action / facet，笔记整份落事件并回到下一回合的状态卡", async () => {
  const written = NOTES.replace("## 已有结论\n（还没有）", "## 已有结论\n- 说主循环是自己写的，未提细节");
  const { interviewer, calls } = stub([out("主循环里怎么处理工具超时？", { facet: "工具超时", notes: written, signal: "thin" })]);
  const result = await runTurn({ runId: "t:2", config, state: state(inProject()), candidate: candidate("我负责主循环"), context, interviewer });
  assert.deepEqual(result.events.map((item) => item.type), ["candidate_said", "interviewer_said", "notes_written"]);
  const [spoke, said1, notesEvent] = result.events;
  assert.equal(spoke.type === "candidate_said" && spoke.payload.signal, "thin");
  assert.ok(said1.type === "interviewer_said" && said1.payload.action === "probe" && said1.payload.facet === "工具超时" && said1.payload.topic === "p1-overview");
  assert.equal(notesEvent.type === "notes_written" && notesEvent.payload.content, written);
  assert.match(calls[0].card, /\[笔记\]/, "状态卡里带上一版笔记");
  assert.equal(calls[0].candidateContent, "我负责主循环");
  assert.match(calls[0].card, /p1-overview/);
  assert.equal(result.progress.covered, 1);
});

test("违约：退回一次并把原因写进状态卡；仍违约由代码定动作、模型只写话；两次都记 fallback_used", async () => {
  const { interviewer, calls } = stub([out("我们聊聊那个不存在的。", { action: "switch", target: "nope" }), out("再聊聊。", { action: "switch", target: "nope" }), out("那接着说主循环。", { action: "probe", facet: null })]);
  const result = await runTurn({ runId: "t:3", config, state: state(inProject()), candidate: candidate("我负责主循环"), context, interviewer });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.runId), ["t:3", "t:3:retry", "t:3:forced"]);
  assert.match(calls[1].card, /必须是材料 id/);
  assert.match(calls[2].card, /代码已定这回合的动作：probe，材料 p1-overview；/);
  const spoken = result.events.find((item) => item.type === "interviewer_said");
  assert.ok(spoken?.type === "interviewer_said" && spoken.payload.action === "probe" && spoken.payload.topic === "p1-overview", "记的是代码定的动作，不是模型第三次填的");
  assert.deepEqual(result.events.filter((item) => item.type === "fallback_used").map((item) => item.type === "fallback_used" && item.payload.reason.slice(0, 9)), ["重出：switch", "重出：switch"]);
  assert.equal(result.phase, "running");
});

test("文字带内部词：重出一次；第二次干净就用第二次", async () => {
  const { interviewer, calls } = stub([out("按评分标准你这题过了。", { facet: "超时" }), out("那超时时怎么兜底？", { facet: "超时" })]);
  const result = await runTurn({ runId: "t:4", config, state: state(inProject()), candidate: candidate("答"), context, interviewer });
  assert.equal(calls.length, 2);
  assert.match(calls[1].card, /内部词/);
  assert.equal(result.said.at(-1)?.content, "那超时时怎么兜底？");
});

test("收尾：模型判断该收就 end，记 ended(by interviewer)；结束按钮不调模型、记 ended(by candidate)", async () => {
  const dry = [...inProject(), ...Array.from({ length: 2 }, () => [said("换个说法？", { topic: "p1-overview", action: "clarify", kind: "aside" }), answered("不知道", "dont_know")]).flat()];
  const { interviewer } = stub([out("好，今天就到这里，谢谢你的时间。", { action: "end", signal: "dont_know" })]);
  const result = await runTurn({ runId: "t:5", config, state: state(dry), candidate: candidate("不会"), context, interviewer });
  assert.deepEqual(result.events.map((item) => item.type), ["candidate_said", "interviewer_said", "notes_written", "ended"]);
  assert.equal(result.phase, "ended");
  assert.equal(result.endedBy, "interviewer");
  assert.equal(result.said.at(-1)?.kind, "closing");

  const { interviewer: never, calls } = stub([]);
  const button = await runTurn({ runId: "t:6", config, state: state(inProject()), candidate: candidate("", "end"), context, interviewer: never });
  assert.equal(calls.length, 0);
  assert.deepEqual(button.events.map((item) => item.type), ["candidate_said", "interviewer_said", "ended"]);
  assert.equal(button.endedBy, "candidate");
  assert.equal(button.runId, null);
});

test("模型没产出：回合失败抛错，不编一句", async () => {
  const { interviewer } = stub([]);
  await assert.rejects(runTurn({ runId: "t:7", config, state: state(inProject()), candidate: candidate("答"), context, interviewer }), /模型没有产出/);
});

test("工具调用 → 事件形状：取关键词或包名，截 60 字", () => {
  assert.deepEqual(toolUsesOf([{ toolName: "lookup_resume", input: { keyword: "压测" } }, { toolName: "load_skill", input: { name: "backend-java" } }, { toolName: "x", input: null }]), [
    { name: "lookup_resume", argument: "压测" },
    { name: "load_skill", argument: "backend-java" },
    { name: "x", argument: null },
  ]);
});

/** 桩（工具路径）：像循环里的钩子那样把每个产出交给 judge，被退回就取下一个，合法的那个作为 ask_candidate 的挂起调用返回。 */
function stubViaTool(outputs: InterviewerOutput[]) {
  const calls: InterviewerCall[] = [];
  const rejected: string[] = [];
  const interviewer: Interviewer = async (input) => {
    calls.push(input);
    for (;;) {
      const output = outputs.shift();
      if (!output) throw new Error("模型没有产出");
      const reason = input.judge?.(output) ?? null;
      if (reason) {
        rejected.push(reason);
        continue;
      }
      return { output, partial: false, runId: input.runId, provider: "openai", model: "gpt-test", durationMs: 0, steps: 1, toolCalls: [{ toolCallId: "ask-1", toolName: "ask_candidate", input: output }], events: [] };
    }
  };
  return { interviewer, calls, rejected };
}

test("提问工具路径：违约在同一回合内被钩子退回，第二次起代码定动作；只调一次、账与直接输出路径一致", async () => {
  const { interviewer, calls, rejected } = stubViaTool([out("聊聊不存在的。", { action: "switch", target: "nope" }), out("再聊聊。", { action: "switch", target: "nope" }), out("那接着说主循环。", { action: "probe", facet: null })]);
  const result = await runTurn({ runId: "t:7", config, state: state(inProject()), candidate: candidate("我负责主循环"), context, interviewer });
  assert.equal(calls.length, 1, "工具路径在循环内重试，不再重新调用面试官");
  assert.match(rejected[0], /必须是材料 id/);
  assert.match(rejected[1], /代码已定这回合的动作：probe，材料 p1-overview；/);
  const spoken = result.events.find((item) => item.type === "interviewer_said");
  assert.ok(spoken?.type === "interviewer_said" && spoken.payload.action === "probe" && spoken.payload.topic === "p1-overview", "记的是代码定的动作");
  assert.deepEqual(result.events.filter((item) => item.type === "fallback_used").map((item) => item.type === "fallback_used" && item.payload.reason.slice(0, 9)), ["重出：switch", "重出：switch"]);
  assert.equal(result.events.filter((item) => item.type === "tool_called").length, 0, "提问工具不进工具账");
});

test("固定题本策略：不调模型、动作按状态推、不听回答；开场问介绍，项目按角度追，全部合法不触发重出", async () => {
  const opening = await runTurn({ runId: "s:1", config, state: state([]), candidate: null, context, interviewer: scriptInterviewer });
  const first = opening.events.find((item) => item.type === "interviewer_said");
  assert.ok(first?.type === "interviewer_said" && first.payload.action === "probe" && /介绍/.test(first.payload.content));
  const probe = await runTurn({ runId: "s:2", config, state: state(inProject()), candidate: candidate("我不会"), context, interviewer: scriptInterviewer });
  const spoken = probe.events.find((item) => item.type === "interviewer_said");
  assert.ok(spoken?.type === "interviewer_said" && spoken.payload.action === "probe" && spoken.payload.facet === "工具链路", "项目材料按第一个角度追");
  const said = probe.events.find((item) => item.type === "candidate_said");
  assert.equal(said?.type === "candidate_said" && said.payload.signal, "answered", "固定题本不听回答：signal 永远 answered");
  assert.equal(probe.events.filter((item) => item.type === "fallback_used").length, 0, "按状态推的动作天然合法");
  assert.equal(probe.runId, "s:2");
});

test("switch 目标归一：id + 名字、只有名字都认成材料 id；认不出的原样留给底线退回", () => {
  const before = { materials: testBrief().areas.map((area) => ({ id: area.id, name: area.name })) } as unknown as Parameters<typeof resolveTarget>[0];
  assert.equal(resolveTarget(before, "q1"), "q1");
  assert.equal(resolveTarget(before, "q1 缓存一致性的失效策略"), "q1");
  assert.equal(resolveTarget(before, "q1：缓存一致性"), "q1");
  assert.equal(resolveTarget(before, "缓存一致性"), "q1");
  assert.equal(resolveTarget(before, "nope"), "nope");
  assert.equal(resolveTarget(before, null), null);
});

test("笔记格式门：缺段落或编号丢了退回一次，第二次放行并记账；不代码接管动作", async () => {
  const broken = "## 待验证\n（没了）\n## 接下来\n- 继续";
  const { interviewer, calls } = stub([out("接着说主循环。", { notes: broken }), out("接着说主循环。", { notes: broken })]);
  const result = await runTurn({ runId: "t:9", config, state: state(inProject()), candidate: candidate("答"), context, interviewer });
  assert.equal(calls.length, 2, "退回一次");
  assert.match(calls[1].card, /笔记缺少段落/);
  assert.deepEqual(result.events.filter((item) => item.type === "fallback_used").length, 1);
  assert.equal(result.events.find((item) => item.type === "notes_written")?.type, "notes_written", "第二次照单收下");
  assert.equal(result.said.at(-1)?.action, "probe", "动作没被代码接管");
});
