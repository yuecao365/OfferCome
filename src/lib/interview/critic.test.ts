import assert from "node:assert/strict";
import test from "node:test";

import { latestCriticNote } from "./critic";
import type { InterviewEvent, TranscriptLine } from "./events";
import { sessionFlags } from "./flags";

const line = (seq: number, role: "interviewer" | "candidate"): TranscriptLine => ({ seq, role, content: `${role}-${seq}`, kind: role === "interviewer" ? "say" : null, control: null });
const noted = (seq: number, text: string): InterviewEvent => ({ seq: 100 + seq, type: "critic_noted", payload: { seq, rule: "multi_ask", text }, runId: null, at: new Date() });

test("现场卡只注入针对面试官最后一句的提醒；过时的不要", () => {
  const transcript = [line(0, "interviewer"), line(1, "candidate"), line(2, "interviewer"), line(3, "candidate")];
  assert.equal(latestCriticNote([noted(2, "这句只问一个")], transcript), "这句只问一个");
  assert.equal(latestCriticNote([noted(0, "过时了")], transcript), null);
  assert.equal(latestCriticNote([], transcript), null);
  assert.equal(latestCriticNote([noted(2, "x")], []), null);
});

test("开关：默认开；flagsJson 里明确 false 才关；坏 JSON 按默认", () => {
  assert.deepEqual(sessionFlags(null), { critic: true });
  assert.deepEqual(sessionFlags('{"critic":false}'), { critic: false });
  assert.deepEqual(sessionFlags('{"critic":"no"}'), { critic: true });
  assert.deepEqual(sessionFlags("{oops"), { critic: true });
});
