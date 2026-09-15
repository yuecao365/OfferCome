import assert from "node:assert/strict";
import test from "node:test";

import { appendEvents, endedBy, event, parseEventRow, transcriptOf, type EventSink, type InterviewEvent } from "./events";

/** 内存里的事件表：测写入器的 seq 分配与投影。 */
function memorySink() {
  const rows: { sessionId: string; seq: number; type: string; payloadJson: string; runId: string | null; createdAt: Date }[] = [];
  const sink: EventSink = {
    interviewEvent: {
      aggregate: async ({ where }) => ({ _max: { seq: rows.filter((row) => row.sessionId === where.sessionId).reduce<number | null>((max, row) => (max === null || row.seq > max ? row.seq : max), null) } }),
      createMany: async ({ data }) => {
        for (const row of data) rows.push({ ...row, createdAt: new Date() });
      },
    },
  };
  return { sink, rows };
}

test("追加写：seq 从 0 连续分配，第二批接着上一批；不同会话互不影响", async () => {
  const { sink, rows } = memorySink();
  assert.equal(await appendEvents(sink, "s1", [event("interviewer_said", { content: "你好", kind: "intro_request" }, "turn:s1:0")]), 0);
  assert.equal(await appendEvents(sink, "s1", [event("candidate_said", { content: "我叫…", clientId: "c1", control: null, composeMs: 1200 }), event("interviewer_said", { content: "先聊项目", kind: "question" })]), 1);
  assert.equal(await appendEvents(sink, "s2", [event("ended", { by: "candidate" })]), 0);
  assert.deepEqual(rows.filter((row) => row.sessionId === "s1").map((row) => row.seq), [0, 1, 2]);
  assert.equal(await appendEvents(sink, "s1", []), 0);
});

test("读：坏类型与坏 payload 丢弃；逐字稿与结束方从事件推导", () => {
  const rows = [
    { seq: 0, type: "interviewer_said", payloadJson: JSON.stringify({ content: "你好", kind: "intro_request" }), runId: "r0", createdAt: new Date() },
    { seq: 1, type: "candidate_said", payloadJson: JSON.stringify({ content: "自我介绍", clientId: "c1", control: null, composeMs: null }), runId: null, createdAt: new Date() },
    { seq: 2, type: "nonsense", payloadJson: "{}", runId: null, createdAt: new Date() },
    { seq: 3, type: "candidate_said", payloadJson: "{not json", runId: null, createdAt: new Date() },
    { seq: 4, type: "candidate_said", payloadJson: JSON.stringify({ content: "结束吧", clientId: "c2", control: "end", composeMs: 3 }), runId: null, createdAt: new Date() },
    { seq: 5, type: "interviewer_said", payloadJson: JSON.stringify({ content: "再见", kind: "closing" }), runId: null, createdAt: new Date() },
    { seq: 6, type: "ended", payloadJson: JSON.stringify({ by: "candidate" }), runId: null, createdAt: new Date() },
  ];
  const events = rows.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  assert.deepEqual(events.map((item) => item.seq), [0, 1, 4, 5, 6]);
  const transcript = transcriptOf(events);
  assert.deepEqual(transcript.map((line) => [line.role, line.kind, line.control]), [
    ["interviewer", "intro_request", null],
    ["candidate", null, null],
    ["candidate", null, "end"],
    ["interviewer", "closing", null],
  ]);
  assert.equal(endedBy(events), "candidate");
  assert.equal(endedBy(events.slice(0, 2)), null);
});
