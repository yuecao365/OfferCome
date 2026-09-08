import assert from "node:assert/strict";
import test from "node:test";

import { fallbackBrief } from "./brief";
import { buildConversation, selectConversation } from "./conversation";
import { emptyMemory } from "./memory";
import { createInterviewerState, type MessageKind, type MessageRole, type MessageState, type ThreadState } from "./state";

/**
 * 对话窗口按线程对齐：进行中线程整段保留，上一条线程只留最后一问一答，
 * 插话不进对话，澄清 / 提示只留最近一对，超长时保住切入问答。
 */

const brief = fallbackBrief({
  blueprint: {
    summary: "后端",
    completeness: "complete",
    missingInformation: [],
    competencies: [
      { id: "c1", name: "工具调用", description: "", priority: "core", jdEvidence: "工具", origin: "jd", sourceUrl: null },
      { id: "c2", name: "稳定性", description: "", priority: "core", jdEvidence: "稳定", origin: "jd", sourceUrl: null },
    ],
  },
  projects: [{ id: "p1", name: "Study Assistant" }],
  pace: "standard",
  round: null,
  askIntro: true,
});

let seq = 0;
function msg(turnIndex: number, role: MessageRole, kind: MessageKind, content: string, threadId: string | null): MessageState {
  seq += 1;
  return { id: `m${seq}`, turnIndex, role, kind, content, threadId, toolName: null };
}

function thread(id: string, openedAtTurn: number, closedAtTurn: number | null): ThreadState {
  return {
    id,
    areaId: brief.areas[0].id,
    entryQuestion: `${id} 切入`,
    status: closedAtTurn === null ? "active" : "closed",
    depth: 2,
    rescues: 0,
    clarifies: 0,
    interrupts: 0,
    openedAtTurn,
    closedAtTurn,
    note: "答到第二层",
  };
}

function state(threads: ThreadState[], messages: MessageState[]) {
  return createInterviewerState({ brief, memory: emptyMemory(brief), threads, messages, ended: false });
}

/** 第一条线程 t1 的完整往来：切入、追问、澄清、提示、追问。 */
function firstThread(): MessageState[] {
  return [
    msg(0, "interviewer", "intro_request", "请先自我介绍。", null),
    msg(1, "candidate", "answer", "我是曹岳。", null),
    msg(1, "interviewer", "question", "t1 切入", "t1"),
    msg(2, "candidate", "answer", "主循环分五段。", "t1"),
    msg(2, "interviewer", "probe", "追问一", "t1"),
    msg(3, "candidate", "question", "这题想考什么？", "t1"),
    msg(3, "interviewer", "clarify", "考架构。", "t1"),
    msg(4, "candidate", "question", "能给点提示吗？", "t1"),
    msg(4, "interviewer", "rescue", "从工具协议说起。", "t1"),
    msg(5, "candidate", "answer", "工具通过注册表注册。", "t1"),
    msg(5, "interviewer", "probe", "追问二", "t1"),
  ];
}

test("进行中线程整段保留，只丢掉旧的澄清 / 提示往来", () => {
  const picked = selectConversation(state([thread("t1", 1, null)], firstThread())).map((m) => m.content);
  assert.deepEqual(picked, [
    "请先自我介绍。",
    "我是曹岳。",
    "t1 切入",
    "主循环分五段。",
    "追问一",
    "能给点提示吗？",
    "从工具协议说起。",
    "工具通过注册表注册。",
    "追问二",
  ]);
});

test("上一条线程只留最后一问一答，开场与插话不进对话", () => {
  const messages = [
    ...firstThread(),
    msg(6, "candidate", "answer", "第二层的回答。", "t1"),
    msg(6, "interviewer", "question", "t2 切入", "t2"),
    msg(7, "candidate", "answer", "t2 的回答。", "t2"),
    msg(7, "interviewer", "probe", "t2 追问", "t2"),
    msg(8, "candidate", "aside", "再说一遍", "t2"),
    msg(8, "interviewer", "aside", "我再说一遍：t2 追问", "t2"),
    msg(9, "candidate", "answer", "t2 第二个回答。", "t2"),
    msg(9, "interviewer", "probe", "t2 追问二", "t2"),
  ];
  const picked = selectConversation(state([thread("t1", 1, 6), thread("t2", 6, null)], messages)).map((m) => m.content);
  assert.deepEqual(picked, [
    "追问二",
    "第二层的回答。",
    "t2 切入",
    "t2 的回答。",
    "t2 追问",
    "我再说一遍：t2 追问",
    "t2 第二个回答。",
    "t2 追问二",
  ]);
});

test("线程之间的过渡语境跟着上一条线程的边界走", () => {
  const messages = [
    ...firstThread(),
    msg(6, "candidate", "answer", "第二层的回答。", "t1"),
    msg(6, "interviewer", "aside", "这段到这里。", null),
    msg(7, "candidate", "answer", "好的。", null),
  ];
  const picked = selectConversation(state([thread("t1", 1, 6)], messages)).map((m) => m.content);
  assert.deepEqual(picked, ["追问二", "第二层的回答。", "这段到这里。", "好的。"]);
});

test("插话被丢掉后相邻的同角色消息合并，保持交替", () => {
  const messages = [
    msg(1, "interviewer", "question", "t1 切入", "t1"),
    msg(2, "candidate", "aside", "跳过", "t1"),
    msg(2, "interviewer", "aside", "我们跳过这题。", "t1"),
    msg(2, "interviewer", "question", "t2 切入", "t2"),
    msg(3, "candidate", "answer", "t2 的回答。", "t2"),
  ];
  const conversation = buildConversation(state([thread("t1", 1, 2), thread("t2", 2, null)], messages));
  assert.deepEqual(
    conversation.map((m) => m.role),
    ["assistant", "user"],
  );
  assert.equal(conversation[0].content, "t1 切入\n\n我们跳过这题。\n\nt2 切入");
});

test("超出字符上限时从最旧的丢，切入问答与最后两条保住", () => {
  const long = "字".repeat(100);
  const messages = [
    msg(0, "interviewer", "intro_request", "请先自我介绍。", null),
    msg(1, "candidate", "answer", long, null),
    msg(1, "interviewer", "question", "t1 切入", "t1"),
    msg(2, "candidate", "answer", `首答${long}`, "t1"),
    msg(2, "interviewer", "probe", "追问一", "t1"),
    msg(3, "candidate", "answer", `二答${long}`, "t1"),
    msg(3, "interviewer", "probe", "追问二", "t1"),
    msg(4, "candidate", "answer", `三答${long}`, "t1"),
    msg(4, "interviewer", "probe", "追问三", "t1"),
  ];
  const picked = selectConversation(state([thread("t1", 1, null)], messages), 220).map((m) => m.content.slice(0, 4));
  assert.deepEqual(picked, ["t1 切", "首答字字", "追问二", "三答字字", "追问三"]);
});
