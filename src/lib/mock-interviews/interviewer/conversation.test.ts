import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { buildConversation, selectConversation } from "./conversation";
import { emptyMemory } from "./memory";
import { createInterviewerState, type MessageKind, type MessageRole, type MessageState } from "./state";

/** 对话原文只追加：整场保留，结束插话不进，超长从最旧的整条丢，相邻同角色合并。 */

const brief = testBrief();

let seq = 0;
function msg(turnIndex: number, role: MessageRole, kind: MessageKind, content: string, threadId: string | null): MessageState {
  seq += 1;
  return { id: `m${seq}`, turnIndex, role, kind, content, threadId, toolName: null };
}

function state(messages: MessageState[]) {
  return createInterviewerState({ brief, memory: emptyMemory(brief), plan: null, threads: [], messages, ended: false });
}

test("整场保留：开场、自我介绍、每个话题的问答与候选人的求助都在；结束插话不进", () => {
  const messages = [
    msg(0, "interviewer", "intro_request", "请先自我介绍。", null),
    msg(1, "candidate", "answer", "我是曹岳。", null),
    msg(1, "interviewer", "question", "t1 切入", "t1"),
    msg(2, "candidate", "answer", "能给点提示吗？", "t1"),
    msg(2, "interviewer", "probe", "从工具协议说起。", "t1"),
    msg(3, "candidate", "answer", "工具通过注册表注册。", "t1"),
    msg(3, "interviewer", "question", "t2 切入", "t2"),
    msg(4, "candidate", "aside", "我们结束吧。", "t2"),
  ];
  assert.deepEqual(
    selectConversation(state(messages)).map((m) => m.content),
    ["请先自我介绍。", "我是曹岳。", "t1 切入", "能给点提示吗？", "从工具协议说起。", "工具通过注册表注册。", "t2 切入"],
  );
});

test("相邻的同角色消息合并，保持交替", () => {
  const messages = [
    msg(1, "interviewer", "question", "t1 切入", "t1"),
    msg(2, "candidate", "answer", "跳过", "t1"),
    msg(2, "candidate", "answer", "再补一句", "t1"),
    msg(2, "interviewer", "question", "我们跳过这题。\n\nt2 切入", "t2"),
  ];
  const conversation = buildConversation(state(messages));
  assert.deepEqual(conversation.map((m) => m.role), ["assistant", "user", "assistant"]);
  assert.equal(conversation[1].content, "跳过\n\n再补一句");
});

test("超出字符上限时从最旧的整条丢，最后两条保住", () => {
  const long = "字".repeat(100);
  const messages = [
    msg(0, "interviewer", "intro_request", "请先自我介绍。", null),
    msg(1, "candidate", "answer", long, null),
    msg(1, "interviewer", "question", "t1 切入", "t1"),
    msg(2, "candidate", "answer", `首答${long}`, "t1"),
    msg(2, "interviewer", "probe", "追问一", "t1"),
    msg(3, "candidate", "answer", `二答${long}`, "t1"),
    msg(3, "interviewer", "probe", "追问二", "t1"),
  ];
  assert.deepEqual(selectConversation(state(messages), 220).map((m) => m.content.slice(0, 4)), ["t1 切", "首答字字", "追问一", "二答字字", "追问二"]);
  assert.deepEqual(selectConversation(state(messages), 110).map((m) => m.content.slice(0, 4)), ["追问一", "二答字字", "追问二"]);
  assert.equal(selectConversation(state(messages), 10).length, 2, "再小的上限也留最后两条");
});
