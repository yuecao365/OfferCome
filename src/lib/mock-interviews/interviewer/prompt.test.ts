import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { emptyMemory } from "./memory";
import { renderTurnState } from "./prompt";
import { applyTurn, type TurnDecision } from "./reducer";
import { createInterviewerState, type InterviewerState } from "./state";

/** 现场状态里的算术：计划各项加起来跟剩余回合比、答疑不计、尾段提醒。 */

function say(speech: string, extras: Partial<TurnDecision> = {}): TurnDecision {
  return { speech, plan: null, leave: null, enter: null, ended: false, aside: false, memoryPatch: null, ...extras };
}

let seq = 0;
const answer = (content = "答。") => ({ id: `c${(seq += 1)}`, content, intent: null });

function planned(): InterviewerState {
  const brief = testBrief({ pace: "quick" }); // 12 回合
  let state = applyTurn(createInterviewerState({ brief, memory: emptyMemory(brief), plan: null, threads: [], messages: [], ended: false }), null, say("你好，先介绍一下。")).state;
  state = applyTurn(
    state,
    answer("自我介绍"),
    say("先聊项目。", {
      plan: {
        items: [
          { id: "p1", label: "项目", kind: "project", areaId: "p1-overview", turns: 6 },
          { id: "q1", label: "缓存", kind: "quick", areaId: "q1", turns: 2 },
          { id: "s1", label: "场景", kind: "scenario", areaId: "s1", turns: 3 },
        ],
        note: null,
      },
      enter: { itemId: "p1", label: "项目", kind: "project", areaId: "p1-overview" },
    }),
  ).state;
  return state;
}

test("计划的算术：没聊完的项加起来跟剩余比，正在聊的按计划减已问，超了就写明", () => {
  const state = planned();
  const text = renderTurnState(state);
  // 已说 2（开场 + 第一问），剩 10；计划剩 (6 − 1) + 2 + 3 = 10。
  assert.match(text, /已说 2 回合，总共 12，还剩 10/);
  assert.match(text, /计划里还没聊完的项合计约 10 回合，只剩 10。/);
  assert.match(text, /计划 6 回合，已问 1/);
  const deeper = applyTurn(applyTurn(state, answer(), say("追一层？")).state, answer(), say("再追一层？")).state;
  assert.match(renderTurnState(deeper), /合计约 8 回合，只剩 8。/);
  const over = applyTurn(deeper, answer(), say("再问。", { plan: { items: [...deeper.plan!.items, { id: "q2", label: "多加一道", kind: "quick", areaId: "q2", turns: 4 }], note: null } })).state;
  assert.match(renderTurnState(over), /合计约 11 回合，只剩 7：超 4 回合，改计划/);
});

test("答疑不计入进度但列出来；尾段提醒场景题要留两回合，最后一回合只告别", () => {
  let state = planned();
  state = applyTurn(state, answer("DAU 是什么"), say("日活。", { aside: true })).state;
  assert.match(renderTurnState(state), /已说 2 回合.*另有 1 句答疑不计（余量 3 句）/);
  while (state.brief.turns - state.messages.filter((m) => m.role === "interviewer" && m.kind !== "aside").length > 3) state = applyTurn(state, answer(), say("追问。")).state;
  const text = renderTurnState(state);
  assert.match(text, /只剩 3 回合：场景题还没问，这回合就 enter \[s1\] 把它问出来/);
  assert.match(text, /\[q1\] 缓存（基础快问，约 2 回合）  ← 来不及了，不再问/);
  assert.match(text, /\[s1\] 场景（场景题，约 3 回合）  ← 这回合进/);
  assert.ok(text.lastIndexOf("只剩 3 回合") > text.lastIndexOf("工作记忆："), "尾段提醒是最后一行");
  state = applyTurn(state, answer(), say("追问。")).state;
  state = applyTurn(state, answer(), say("追问。")).state;
  assert.match(renderTurnState(state), /这是最后一回合：只告别/);
});
