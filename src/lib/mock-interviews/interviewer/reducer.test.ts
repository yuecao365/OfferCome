import assert from "node:assert/strict";
import test from "node:test";

import { detectCandidateIntent } from "./actions";
import { areaTurnCost, fallbackBrief, plannedTurns, turnRangeForPace, type InterviewBrief } from "./brief";
import { canAct, coverageComplete, probeLimit } from "./budget";
import { applyMemoryPatch, emptyMemory } from "./memory";
import { applyTurn, FALLBACK_SPEECH, fallbackAction, utterance, type TurnDecision } from "./reducer";
import { threadSegment } from "./segments";
import { activeThread, createInterviewerState, type InterviewerState } from "./state";

/**
 * 回合 reducer 与预算的回归测试：模型的决定只是提案，
 * 这里锁住代码持有的不变量。
 */

const blueprint = {
  summary: "Agent 应用后端",
  completeness: "complete" as const,
  missingInformation: [],
  competencies: [
    { id: "c1", name: "工具调用与编排", description: "工具路由与错误处理", priority: "core" as const, jdEvidence: "工具调用", origin: "jd" as const, sourceUrl: null },
    { id: "c2", name: "后端服务稳定性", description: "超时、重试、降级", priority: "core" as const, jdEvidence: "稳定性", origin: "jd" as const, sourceUrl: null },
  ],
};

function brief(): InterviewBrief {
  return fallbackBrief({
    blueprint,
    projects: [{ id: "p1", name: "Study Assistant" }],
    pace: "standard",
    round: "first_interview",
    askIntro: true,
    skillPacks: ["project-deep-dive"],
  });
}

function fresh(): InterviewerState {
  const b = brief();
  return createInterviewerState({ brief: b, memory: emptyMemory(b), threads: [], messages: [], ended: false });
}

const say = (speech: string, action: TurnDecision["action"] = null): TurnDecision => ({
  speech,
  action,
  memoryPatch: null,
});

test("fallback brief fits the pace's turn budget and keeps the project area first", () => {
  const quick = fallbackBrief({
    blueprint,
    projects: [{ id: "p1", name: "Study Assistant" }],
    pace: "quick",
    round: null,
    askIntro: true,
    skillPacks: [],
  });
  assert.ok(plannedTurns(quick.areas, true) <= turnRangeForPace("quick").max);
  assert.equal(quick.areas[0].kind, "project");
  assert.equal(areaTurnCost(3), 5);
});

test("opening turn asks for an intro even if the model says nothing useful", () => {
  const result = applyTurn(fresh(), null, say(""));
  assert.equal(result.newMessages.length, 1);
  assert.equal(result.newMessages[0].kind, "intro_request");
  assert.equal(result.state.phase, "running");
});

test("open_thread then probe climbs the ladder; probing past the cap is replaced", () => {
  let state = applyTurn(fresh(), null, say("你好", { name: "ask_intro", input: {} })).state;
  state = applyTurn(
    state,
    { id: "m1", content: "我叫林一鸣……", intent: null },
    say("好的", { name: "open_thread", input: { areaId: "area-project", question: "先介绍你负责的部分。" } }),
  ).state;
  assert.equal(activeThread(state)?.areaId, "area-project");

  // 追问上限 = 领域目标深度 + 1 层余量。
  const limit = probeLimit(state, "area-project");
  for (let index = 0; index < limit; index += 1) {
    state = applyTurn(
      state,
      { id: `a${index}`, content: "我负责后端接口和记忆系统的设计。", intent: null },
      say("明白", { name: "probe", input: { question: `再往下一层 ${index}` } }),
    ).state;
  }
  assert.equal(activeThread(state)?.depth, limit);
  assert.equal(canAct(state, "probe").ok, false);

  const over = applyTurn(
    state,
    { id: "a9", content: "还有一点补充。", intent: null },
    say("继续", { name: "probe", input: { question: "第五层" } }),
  );
  const replaced = over.effects.find((effect) => effect.type === "action_replaced");
  assert.ok(replaced && replaced.applied === "close_thread");
  // 关掉之后紧接着开了下一个领域，候选人不会面对没有下文的过渡语。
  assert.ok(activeThread(over.state));
  assert.notEqual(activeThread(over.state)?.areaId, "area-project");
  assert.ok(over.effects.some((effect) => effect.type === "thread_closed"));
});

test("closing a thread yields a segment with entry question, probes and concatenated answers", () => {
  let state = applyTurn(fresh(), null, say("", { name: "ask_intro", input: {} })).state;
  state = applyTurn(state, { id: "m1", content: "自我介绍", intent: null }, say("", { name: "open_thread", input: { areaId: "area-1", question: "切入问题？" } })).state;
  state = applyTurn(state, { id: "m2", content: "第一段回答", intent: null }, say("", { name: "probe", input: { question: "追问一" } })).state;
  const closed = applyTurn(state, { id: "m3", content: "第二段回答", intent: null }, say("", { name: "close_thread", input: { note: "机制清楚，取舍偏弱" } }));
  const effect = closed.effects.find((e) => e.type === "thread_closed");
  assert.ok(effect && effect.type === "thread_closed");
  assert.equal(effect.segment.question, "切入问题？\n追问 1：追问一");
  assert.equal(effect.segment.answer, "第一段回答\n\n第二段回答");
  assert.equal(effect.segment.skipped, false);
  assert.equal(effect.thread.note, "机制清楚，取舍偏弱");
});

test("candidate intents override the model: skip closes, second hint moves on, end ends", () => {
  let state = applyTurn(fresh(), null, say("", { name: "ask_intro", input: {} })).state;
  state = applyTurn(state, { id: "m1", content: "自我介绍", intent: null }, say("", { name: "open_thread", input: { areaId: "area-1", question: "问题一" } })).state;

  const skipped = applyTurn(state, { id: "m2", content: "跳过", intent: detectCandidateIntent("跳过") }, say("那我们继续追问", { name: "probe", input: { question: "不该出现" } }));
  const closedEffect = skipped.effects.find((e) => e.type === "thread_closed");
  assert.ok(closedEffect && closedEffect.type === "thread_closed" && closedEffect.thread.status === "skipped");
  assert.ok(!skipped.newMessages.some((m) => m.content.includes("不该出现")));

  // 第一次要提示留给模型（rescue 允许）；第二次提示已到上限，代码直接推进。
  let s2 = skipped.state;
  s2 = applyTurn(s2, { id: "m3", content: "能提示一下吗", intent: "hint" }, say("给你个方向", { name: "rescue", input: { hint: "想想超时的情况" } })).state;
  assert.equal(activeThread(s2)?.rescues, 1);
  const secondHint = applyTurn(s2, { id: "m4", content: "再提示一下", intent: "hint" }, say("再给一个", { name: "rescue", input: { hint: "不该出现" } }));
  assert.ok(secondHint.effects.some((e) => e.type === "thread_closed"));

  const ended = applyTurn(secondHint.state, { id: "m5", content: "我们结束吧", intent: "end" }, say("好", null));
  assert.equal(ended.state.phase, "ended");
  assert.ok(ended.effects.some((e) => e.type === "interview_ended"));
  // 结束后再来消息不再产生任何变化。
  const after = applyTurn(ended.state, { id: "m6", content: "还在吗", intent: null }, say("在", null));
  assert.equal(after.newMessages.length, 0);
});

test("two idle turns force progress and close_interview is refused until coverage is complete", () => {
  let state = applyTurn(fresh(), null, say("", { name: "ask_intro", input: {} })).state;
  state = applyTurn(state, { id: "m1", content: "自我介绍", intent: null }, say("好的，我们开始。", null)).state;
  assert.equal(state.idleTurns, 1);
  const forced = applyTurn(state, { id: "m2", content: "嗯", intent: null }, say("嗯嗯", null));
  assert.ok(forced.effects.some((e) => e.type === "action_replaced" && e.reason === "连续无推进动作"));
  assert.ok(activeThread(forced.state), "被强制开了一个线程");

  const early = applyTurn(forced.state, { id: "m3", content: "回答", intent: null }, say("那就到这", { name: "close_interview", input: { reason: "想结束" } }));
  assert.ok(early.effects.some((e) => e.type === "action_replaced" && e.requested === "close_interview"));
  assert.notEqual(early.state.phase, "ended");
  assert.equal(coverageComplete(early.state), false);
});

test("a failed model turn still moves the interview forward deterministically", () => {
  const state = applyTurn(fresh(), null, say("", { name: "ask_intro", input: {} })).state;
  const result = applyTurn(state, { id: "m1", content: "自我介绍", intent: null }, { speech: "", action: null, memoryPatch: null, failed: true });
  assert.equal(fallbackAction(state).name, "open_thread");
  assert.equal(result.newMessages.at(-1)?.kind, "question");
  assert.ok(result.newMessages.at(-1)?.content.length);
});

test("memory patches accumulate per area and only touch known hypotheses", () => {
  const b = brief();
  const memory = applyMemoryPatch(
    emptyMemory(b),
    { established: ["会用 Redis 做缓存"], doubtful: ["是否真做过压测"], failed: [], hypotheses: [{ id: "ghost", status: "confirmed", note: null }] },
    { turn: 3, areaId: "area-1" },
  );
  assert.deepEqual(memory.established, [{ areaId: "area-1", text: "会用 Redis 做缓存", turn: 3 }]);
  assert.equal(memory.hypotheses.length, 0);
});

test("segment of a thread without answers is skipped", () => {
  const segment = threadSegment(
    { id: "t", areaId: "a", entryQuestion: "Q", status: "closed", depth: 0, rescues: 0, openedAtTurn: 1, closedAtTurn: 2, note: null },
    [],
  );
  assert.equal(segment.skipped, true);
});

test("utterance keeps the model's paraphrased question and only appends a missing one", () => {
  const question = "缓存和数据库双写时，你怎么保证一致性？";
  // 改写过的问句：不再追加，避免同一个问题问两遍。
  assert.equal(
    utterance("明白。那我想问的是：缓存和数据库双写的时候，你是怎么保证两边一致的？", question),
    "明白。那我想问的是：缓存和数据库双写的时候，你是怎么保证两边一致的？",
  );
  // 只有过渡语：把问句接上。
  assert.equal(utterance("好，这一块先到这里，我们换个话题。", question), `好，这一块先到这里，我们换个话题。\n\n${question}`);
  assert.equal(utterance("", question), question);
});

test("close_thread followed by the model's own open_thread opens that area with the model's question", () => {
  let state = applyTurn(fresh(), null, say("", { name: "ask_intro", input: {} })).state;
  state = applyTurn(
    state,
    { id: "m1", content: "自我介绍", intent: null },
    say("先聊项目？", { name: "open_thread", input: { areaId: "area-project", question: "先聊项目？" } }),
  ).state;
  const result = applyTurn(
    state,
    { id: "m2", content: "我负责后端。", intent: null },
    {
      speech: "这段先到这里。接下来聊工具调用：你们的工具是怎么注册的？",
      action: { name: "close_thread", input: { note: "职责清楚" } },
      followUp: { name: "open_thread", input: { areaId: "area-1", question: "你们的工具是怎么注册的？" } },
      memoryPatch: null,
    },
  );
  const active = activeThread(result.state);
  assert.equal(active?.areaId, "area-1");
  assert.equal(active?.entryQuestion, "你们的工具是怎么注册的？");
  assert.equal(result.newMessages.at(-1)?.kind, "question");
  assert.ok(!result.effects.some((e) => e.type === "action_replaced"));
});

test("a forced close never ends the interview on a dangling question", () => {
  let state = applyTurn(fresh(), null, say("", { name: "ask_intro", input: {} })).state;
  // 用满每个领域的两条线程，让代码没有领域可开。
  for (let round = 0; round < 2; round += 1) {
    for (const area of state.brief.areas) {
      state = applyTurn(
        state,
        { id: `o${round}${area.id}`, content: "嗯", intent: null },
        say("问题？", { name: "open_thread", input: { areaId: area.id, question: "问题？" } }),
      ).state;
      state = applyTurn(
        state,
        { id: `c${round}${area.id}`, content: "回答", intent: null },
        say("好。", { name: "close_thread", input: { note: "ok" } }),
      ).state;
      if (state.phase === "ended") break;
    }
    if (state.phase === "ended") break;
  }
  assert.equal(state.phase, "ended");
});

test("a forced close drops the model's dangling question and says goodbye", () => {
  let state = applyTurn(fresh(), null, say("", { name: "ask_intro", input: {} })).state;
  state = applyTurn(
    state,
    { id: "m1", content: "自我介绍", intent: null },
    say("问题？", { name: "open_thread", input: { areaId: "area-project", question: "问题？" } }),
  ).state;
  // 模型每回合都"收住这段、顺口再问一个"：代码替它开下一个领域时，以它的问句为切入问题；
  // 领域用尽后被迫收尾，最后一条消息只能是告别语，不能停在问句上。
  const speech = "好，这段先到这里。接下来聊聊别的：你怎么看 X？";
  let result = applyTurn(state, { id: "c0", content: "回答", intent: null }, say(speech, { name: "close_thread", input: { note: "ok" } }));
  assert.equal(activeThread(result.state)?.entryQuestion, speech);
  let guard = 0;
  while (result.state.phase !== "ended" && guard < 12) {
    guard += 1;
    result = applyTurn(result.state, { id: `c${guard}`, content: "回答", intent: null }, say(speech, { name: "close_thread", input: { note: "ok" } }));
  }
  assert.equal(result.state.phase, "ended");
  assert.equal(result.newMessages.at(-1)?.content, FALLBACK_SPEECH.closeInterview);
});
