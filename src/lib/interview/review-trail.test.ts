import assert from "node:assert/strict";
import test from "node:test";

import { TEST_AREAS } from "@/lib/test-support/interview-brief";

import type { InterviewEvent } from "./events";
import { moveLabel, reviewTrail, trailMessagesOfEvents, type TrailMessage } from "./review-trail";

const I = (turnIndex: number, content: string, extra: Partial<TrailMessage> = {}): TrailMessage => ({ turnIndex, role: "interviewer", kind: "say", content, ...extra });
const C = (turnIndex: number, content: string, signal: TrailMessage["signal"] = "answered"): TrailMessage => ({ turnIndex, role: "candidate", kind: "answer", content, signal });

const N = (next: string, concluded: string[] = [], doubts: string[] = []) =>
  ["## 待验证", "- [h1] 简历称重试 3 次", "## 已有结论", ...concluded.map((item) => `- ${item}`), "## 存疑", ...doubts.map((item) => `- ${item}`), "## 接下来", `- ${next}`].join("\n");
const messages: TrailMessage[] = [
  I(0, "先介绍一下自己。", { topic: null, action: "probe", notes: N("先聊 Study Assistant 的架构") }),
  C(1, "我做过 Study Assistant。"),
  I(1, "先整体讲讲架构。", { topic: "p1-overview", facet: null, action: "probe", notes: N("追工具链路", ["介绍提到 Study Assistant，模块划分没说"]) }),
  C(2, "有工具链路和安全链路。"),
  I(2, "工具链路里超时怎么处理？", { topic: "p1-overview", facet: 0, action: "probe", notes: N("看他知不知道幂等", ["介绍提到 Study Assistant，模块划分没说", "说了两条链路，超时处理没讲"]) }),
  C(3, "重试三次。"),
  I(3, "重试之间怎么避免重复副作用？", { topic: "p1-overview", facet: 0, action: "probe", notes: N("换角度", ["介绍提到 Study Assistant，模块划分没说", "说了两条链路，超时处理没讲"], ["只说重试三次，幂等存疑"]) }),
  C(4, "这块我不太清楚。", "dont_know"),
  I(4, "那换个角度，安全链路怎么做的？", { topic: "p1-overview", facet: 1, action: "probe", notes: N("项目聊够了就切 q1", ["介绍提到 Study Assistant，模块划分没说", "说了两条链路，超时处理没讲", "幂等答不上"], ["只说重试三次，幂等存疑"]) }),
  C(5, "有输入校验。"),
  I(5, "聊聊缓存一致性。", { topic: "q1", facet: null, action: "switch", notes: N("收尾", ["介绍提到 Study Assistant，模块划分没说", "说了两条链路，超时处理没讲", "幂等答不上", "安全链路只到名词"], ["只说重试三次，幂等存疑"]) }),
  C(6, "先删缓存再更新数据库。"),
  I(6, "好，今天到这里。", { kind: "closing", action: "end", notes: N("结束") }),
];

test("按材料分组，动作翻成人话，连续同角度追问与存疑点亮", () => {
  const trail = reviewTrail(TEST_AREAS, messages);
  assert.equal(trail.hasReasons, true);
  assert.equal(trail.closing, "好，今天到这里。");
  assert.deepEqual(trail.groups.map((group) => [group.name, group.nodes.length]), [["Study Assistant：背景与架构", 4], ["缓存一致性", 1]]);
  const project = trail.groups[0];
  assert.deepEqual(project.nodes.map((node) => node.move), ["问这段的第一个问题", "换个角度", "继续追这一点", "换个角度"]);
  assert.deepEqual(project.nodes.map((node) => node.highlight), [null, null, "doubt", "stuck"]);
  assert.equal(project.nodes[3].candidateNote, "你说不会");
  assert.equal(project.doubts, 2, "「幂等存疑」与「幂等答不上」两条新记下的条目都算存疑");
  assert.equal(project.nodes[1].why, "追工具链路", "理由取上一版笔记的「接下来」");
  assert.equal(project.nodes[2].exchange.candidate, "重试三次。");
  assert.equal(trail.groups[1].nodes[0].move, "换到另一段经历");
});

test("旧场次没有笔记：只列动作，不点亮存疑", () => {
  const bare = messages.map((message) => ({ ...message, notes: undefined }));
  const trail = reviewTrail(TEST_AREAS, bare);
  assert.equal(trail.hasReasons, false);
  assert.deepEqual(trail.groups[0].nodes.map((node) => node.highlight), [null, null, "pressed", "stuck"], "没有笔记就只按连续追问与信号点亮");
});

test("事件日志 → 输入：笔记归到它前面那句面试官发言", () => {
  const at = new Date(0);
  const events = [
    { seq: 0, type: "interviewer_said", payload: { content: "介绍一下", kind: "say", topic: null, facet: null, action: "probe", signal: "answered" }, runId: null, at },
    { seq: 1, type: "candidate_said", payload: { content: "我做过 X", clientId: null, control: null, composeMs: null, signal: "answered" }, runId: null, at },
    { seq: 2, type: "interviewer_said", payload: { content: "X 的架构？", kind: "say", topic: "p1-overview", facet: null, action: "probe", signal: "answered" }, runId: null, at },
    { seq: 3, type: "notes_written", payload: { content: "## 已有结论\n- 提到 X，没说模块" }, runId: null, at },
  ] as InterviewEvent[];
  const out = trailMessagesOfEvents(events);
  assert.equal(out.length, 3);
  assert.match(out[2].notes ?? "", /提到 X，没说模块/);
  assert.equal(out[2].turnIndex, 1);
  assert.equal(out[1].turnIndex, 1, "候选人那句归到它后面那回合");
});

test("动作标签", () => {
  assert.equal(moveLabel({ action: "probe", kind: "say", opening: false, sameFacet: true, facet: 0, firstInArea: false }), "继续追这一点");
  assert.equal(moveLabel({ action: "clarify", kind: "aside", opening: false, sameFacet: false, facet: null, firstInArea: false }), "把题说具体");
  assert.equal(moveLabel({ action: "probe", kind: "say", opening: false, sameFacet: false, facet: null, firstInArea: false }), "继续问这段");
});
