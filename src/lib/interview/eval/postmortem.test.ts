import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import type { InterviewEvent } from "../events";
import { postmortem } from "./postmortem";

let seq = 0;
const at = new Date();
const said = (role: "interviewer" | "candidate", content: string, extra: { topic?: string | null; kind?: string; control?: "hint" | "skip" | "repeat" | "end" | null } = {}): InterviewEvent =>
  role === "interviewer"
    ? { seq: seq++, type: "interviewer_said", payload: { content, kind: extra.kind ?? "say", topic: extra.topic ?? null }, runId: null, at }
    : { seq: seq++, type: "candidate_said", payload: { content, clientId: null, control: extra.control ?? null, composeMs: null }, runId: null, at };
const tick = (_ignored: number): InterviewEvent => ({ seq: seq++, type: "progress_tick", payload: { covered: 1, quota: 6, budgetLeft: 1 }, runId: null, at });
const guard = (): InterviewEvent => ({ seq: seq++, type: "fallback_used", payload: { reason: "重复提问", original: "原话" }, runId: null, at });

test("复盘：回答分类与超长、面试官的四种违规（含超预算）、底线次数、归因句", () => {
  const events: InterviewEvent[] = [
    said("interviewer", "你好，先介绍一下。"),
    tick(0.5),
    said("candidate", "一".repeat(600)),
    said("interviewer", "退出标志位控制线程退出，偶发不退出，为什么？", { topic: "q1" }),
    tick(3),
    said("candidate", "我不会"),
    said("interviewer", "换个说法：退出标志位控制线程退出，偶发不退出，为什么？", { topic: "q1" }),
    tick(4),
    said("candidate", "我不知道"),
    said("interviewer", "那从可见性说说？", { topic: "q1" }),
    tick(5),
    said("candidate", "能具体一点吗？", { control: "hint" }),
    said("interviewer", "第一，你怎么看？第二，为什么？", { topic: "q2" }),
    tick(21),
    said("candidate", "答"),
    said("interviewer", "再问一个：你会先看什么？", { topic: "q2" }),
    guard(),
    tick(22),
  ];
  const result = postmortem({ events, brief: testBrief(), ready: false });
  assert.deepEqual(result.replies, { normal: 2, help: 1, dont_know: 2, not_mine: 0, non_answer: 0, skip: 0, long: 1 });
  assert.deepEqual(result.violations.map((item) => item.rule), ["repeat", "over_budget", "stuck_after_dont_know", "multi_ask"], "q1 预算 2 句，第 3 句超预算");
  assert.deepEqual(result.guards, [{ seq: 16, reason: "重复提问", original: "原话" }]);
  assert.equal(result.ready, false);
  assert.match(result.summary[0], /备课没备好/);
  assert.ok(result.summary.some((line) => /同一题重复问 1 次/.test(line)));
  assert.ok(result.summary.some((line) => /两次答不上还没换题 1 次/.test(line)));
  assert.deepEqual(postmortem({ events: [said("interviewer", "你好。"), tick(0.5), said("candidate", "答")], brief: testBrief(), ready: true }).summary, ["没有发现准则违反或异常行为"]);
});

test("轨迹（G6）：没有记账为 null；带着工具一次没调、无效调用、触顶各一句", () => {
  const base = { events: [], brief: null, ready: true };
  assert.equal(postmortem(base).trajectory, null);
  const quiet = postmortem({ ...base, trajectory: { evaluation: [{ steps: 1, toolCalls: 0, invalidCalls: 0, budgetHit: false, resumeInconsistent: 0, toolShift: null }], interviewerLookups: 0 } });
  assert.deepEqual(quiet.trajectory, { evaluationSteps: 1, evaluationToolCalls: 0, invalidToolCalls: 0, budgetHits: 0, interviewerLookups: 0 });
  assert.ok(quiet.summary.some((line) => line.includes("一次都没调")));
  const busy = postmortem({ ...base, trajectory: { evaluation: [{ steps: 3, toolCalls: 2, invalidCalls: 1, budgetHit: true, resumeInconsistent: 0, toolShift: 2 }], interviewerLookups: 1 } });
  assert.ok(busy.summary.some((line) => line.includes("1 次无效工具调用")) && busy.summary.some((line) => line.includes("1 段触顶预算")));
});
