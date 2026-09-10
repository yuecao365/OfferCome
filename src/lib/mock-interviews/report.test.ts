import assert from "node:assert/strict";
import test from "node:test";

import { parseStoredReport, type MockInterviewReport } from "./report";

const v2: MockInterviewReport = {
  version: 2,
  totalScore: 72,
  summary: "主干清楚。",
  strengths: [{ point: "主循环讲得清楚", areaName: "项目深挖" }],
  weaknesses: [{ point: "工具协议的失败路径没答上", areaName: "项目深挖", kind: "missing" }],
  advice: ["练一遍失败路径"],
  hypotheses: [{ text: "Harness 由本人主导", status: "confirmed", verdict: "主循环分段与错误回传都能讲到实现细节。" }],
};

test("v2 reports read back unchanged", () => {
  assert.deepEqual(parseStoredReport(JSON.stringify(v2)), v2);
});

test("bad, unknown or pre-v2 data returns null", () => {
  assert.equal(parseStoredReport(null), null);
  assert.equal(parseStoredReport("{ not json"), null);
  assert.equal(parseStoredReport(JSON.stringify({ totalScore: 1 })), null);
  assert.equal(parseStoredReport(JSON.stringify({ totalScore: 60, summary: "旧报告", strengths: [], improvements: [], actionPlan: [] })), null);
});
