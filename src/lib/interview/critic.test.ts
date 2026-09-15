import assert from "node:assert/strict";
import test from "node:test";

import { latestCriticNote } from "./critic";
import type { InterviewEvent, TranscriptLine } from "./events";
import { fillFlags, sessionFlags } from "./flags";

const line = (seq: number, role: "interviewer" | "candidate"): TranscriptLine => ({ seq, role, content: `${role}-${seq}`, kind: role === "interviewer" ? "say" : null, control: null });
const noted = (seq: number, text: string): InterviewEvent => ({ seq: 100 + seq, type: "critic_noted", payload: { seq, rule: "multi_ask", text }, runId: null, at: new Date() });

test("现场卡只注入针对面试官最后一句的提醒；过时的不要", () => {
  const transcript = [line(0, "interviewer"), line(1, "candidate"), line(2, "interviewer"), line(3, "candidate")];
  assert.equal(latestCriticNote([noted(2, "这句只问一个")], transcript), "这句只问一个");
  assert.equal(latestCriticNote([noted(0, "过时了")], transcript), null);
  assert.equal(latestCriticNote([], transcript), null);
  assert.equal(latestCriticNote([noted(2, "x")], []), null);
});

test("开关：默认开；flagsJson 里明确 false 才关；坏 JSON 按默认；补开关只填没定的项", () => {
  assert.deepEqual(sessionFlags(null), { critic: true, policy: null, shadow: null });
  assert.deepEqual(sessionFlags('{"critic":false,"policy":"v2-terse"}'), { critic: false, policy: "v2-terse", shadow: null });
  assert.deepEqual(sessionFlags('{"critic":"no"}'), { critic: true, policy: null, shadow: null });
  assert.deepEqual(sessionFlags("{oops"), { critic: true, policy: null, shadow: null });
  assert.deepEqual(JSON.parse(fillFlags('{"policy":"v2-terse"}', { policy: "v2", shadow: "v2-terse" })), { critic: true, policy: "v2-terse", shadow: "v2-terse" });
  assert.deepEqual(JSON.parse(fillFlags(null, { policy: "v2", shadow: null })), { critic: true, policy: "v2", shadow: null });
});
