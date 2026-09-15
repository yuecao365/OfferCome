import assert from "node:assert/strict";
import test from "node:test";

import type { InterviewEvent, TranscriptLine } from "./events";
import { closedSegments, repairJudgement } from "./judge";

const ask = (seq: number, topic: string | null): TranscriptLine => ({ seq, role: "interviewer", content: `问 ${seq}`, kind: "say", control: null, topic });
const reply = (seq: number): TranscriptLine => ({ seq, role: "candidate", content: `答 ${seq}`, kind: null, control: null });
const scored = (startSeq: number): InterviewEvent => ({ seq: 200 + startSeq, type: "segment_scored", payload: { startSeq, endSeq: startSeq + 3, competencyId: "c1", difficulty: 2, score: 70, confidence: 0.8, note: "n" }, runId: null, at: new Date() });

test("在线分段：按面试官自报的材料切，材料换了才开新段；最后一段还没结束；开场没报材料的不算；评过的不再给", () => {
  const transcript = [ask(0, null), reply(1), ask(2, "p1"), reply(3), ask(4, null), reply(5), ask(6, "q1"), reply(7), ask(8, "q1"), reply(9), ask(10, "s1")];
  assert.deepEqual(closedSegments([], transcript), [
    { startSeq: 2, endSeq: 5, materialId: "p1" },
    { startSeq: 6, endSeq: 9, materialId: "q1" },
  ]);
  assert.deepEqual(closedSegments([scored(2)], transcript).map((segment) => segment.startSeq), [6]);
  assert.deepEqual(closedSegments([], [ask(0, null), reply(1), ask(2, "p1"), reply(3)]), []);
});

test("修判断：引用不在原话里降一层、把握打折；含糊话最多第 2 层；分数夹进层的分段；能力 id 只认清单", () => {
  const competencies = [{ id: "c1", name: "追踪", priority: "core" as const }];
  const answers = ["每个 step 带 parent_step_id，回放时按它拼成树，因为全量存 payload 太贵所以只留摘要。"];
  const base = { competencyId: "c1", difficulty: 3, evidence: "因为全量存 payload 太贵所以只留摘要", score: 80, confidence: 0.9, note: "n" };
  assert.deepEqual(repairJudgement(base, answers, competencies, null), { competencyId: "c1", difficulty: 3, score: 80, confidence: 0.9, note: "n" });
  const unquoted = repairJudgement({ ...base, evidence: "我们做了严格的压测对比" }, answers, competencies, null);
  assert.deepEqual([unquoted?.difficulty, unquoted?.score, unquoted?.confidence], [2, 70, 0.63]);
  const hedged = repairJudgement({ ...base, difficulty: 4, score: 90, evidence: "应该是按它拼成树" }, ["应该是按它拼成树吧，记不太清了。"], competencies, null);
  assert.deepEqual([hedged?.difficulty, hedged?.score], [2, 70]);
  assert.equal(repairJudgement({ ...base, competencyId: "nope" }, answers, competencies, "c1")?.competencyId, "c1");
  assert.equal(repairJudgement({ ...base, competencyId: "nope" }, answers, competencies, null), null);
});
