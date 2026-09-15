import assert from "node:assert/strict";
import test from "node:test";

import type { InterviewEvent } from "./events";
import { closedSegments, repairJudgement } from "./judge";

const label = (seq: number, act: string, materialId: string | null = null): InterviewEvent => ({ seq: 100 + seq, type: "label_added", payload: { seq, materialId, competencyId: null, act }, runId: null, at: new Date() });
const scored = (startSeq: number): InterviewEvent => ({ seq: 200 + startSeq, type: "segment_scored", payload: { startSeq, endSeq: startSeq + 3, competencyId: "c1", difficulty: 2, score: 70, confidence: 0.8, note: "n" }, runId: null, at: new Date() });

test("在线分段：open / switch 开段，到下一个边界之前；最后一段还没结束；close 不成段；评过的与开场的不再给", () => {
  const events = [label(0, "open"), label(2, "probe", "p1-module"), label(4, "hint"), label(6, "switch", "q1"), label(8, "probe"), label(10, "switch", "s1")];
  assert.deepEqual(closedSegments(events), [
    { startSeq: 0, endSeq: 5, materialId: "p1-module" },
    { startSeq: 6, endSeq: 9, materialId: "q1" },
  ]);
  assert.deepEqual(closedSegments([...events, scored(0)]).map((segment) => segment.startSeq), [6]);
  assert.deepEqual(closedSegments([...events, label(12, "close")]).map((segment) => segment.startSeq), [0, 6, 10]);
  assert.deepEqual(closedSegments([label(0, "open"), label(2, "probe")]), []);
  assert.deepEqual(closedSegments(events, 0).map((segment) => segment.startSeq), [6]);
  // 换了材料也算边界（标注器常把换材料标成 probe）。
  const drifted = [label(0, "open", "p1-overview"), label(2, "probe", "p1-overview"), label(4, "probe", "p1-module"), label(6, "probe"), label(8, "probe", "q1"), label(10, "close")];
  assert.deepEqual(closedSegments(drifted, 0), [
    { startSeq: 4, endSeq: 7, materialId: "p1-module" },
    { startSeq: 8, endSeq: 9, materialId: "q1" },
  ]);
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
