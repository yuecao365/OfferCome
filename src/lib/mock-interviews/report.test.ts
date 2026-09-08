import assert from "node:assert/strict";
import test from "node:test";

import { fromLegacyReport, parseStoredReport, toLegacyReport, type MockInterviewReport } from "./report";

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

test("v1 reports map improvements and the action plan into advice", () => {
  const legacy = { totalScore: 60, summary: "旧报告", strengths: ["A"], improvements: ["B"], actionPlan: ["C"] };
  assert.deepEqual(parseStoredReport(JSON.stringify(legacy)), {
    version: 2,
    totalScore: 60,
    summary: "旧报告",
    strengths: [{ point: "A", areaName: null }],
    weaknesses: [],
    advice: ["B", "C"],
    hypotheses: [],
  });
  assert.deepEqual(fromLegacyReport(legacy), parseStoredReport(JSON.stringify(legacy)));
});

test("bad or unknown data returns null", () => {
  assert.equal(parseStoredReport(null), null);
  assert.equal(parseStoredReport("{ not json"), null);
  assert.equal(parseStoredReport(JSON.stringify({ totalScore: 1 })), null);
});

test("folding v2 back to the legacy shape keeps the trial storage readable", () => {
  assert.deepEqual(toLegacyReport(v2), {
    totalScore: 72,
    summary: "主干清楚。",
    strengths: ["主循环讲得清楚"],
    improvements: ["工具协议的失败路径没答上"],
    actionPlan: ["练一遍失败路径"],
  });
});
