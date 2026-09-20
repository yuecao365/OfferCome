import assert from "node:assert/strict";
import test from "node:test";

import { parseStoredReport, type MockInterviewReport } from "./report";

const hypotheses: MockInterviewReport["hypotheses"] = [{ text: "Harness 由本人主导", status: "confirmed", verdict: "主循环分段与错误回传都能讲到实现细节。" }];
const v3: MockInterviewReport = {
  version: 3,
  totalScore: 72,
  summary: "主干清楚。失败路径没答上。",
  strengths: [{ point: "主循环讲得清楚", areaName: "项目深挖" }],
  weaknesses: [{ point: "工具协议的失败路径没答上", areaName: "项目深挖", kind: "missing", practice: "练一遍失败路径" }],
  hypotheses,
};

test("v3 reports read back unchanged", () => {
  assert.deepEqual(parseStoredReport(JSON.stringify(v3)), v3);
});

test("v2 reports upgrade in memory: advice attaches to weaknesses in order, extra advice becomes a weakness", () => {
  const v2 = {
    version: 2,
    totalScore: 72,
    summary: "主干清楚。",
    strengths: v3.strengths,
    weaknesses: [{ point: "工具协议的失败路径没答上", areaName: "项目深挖", kind: "missing" }],
    advice: ["练一遍失败路径", "补一次数字口径"],
    hypotheses,
  };
  assert.deepEqual(parseStoredReport(JSON.stringify(v2)), {
    version: 3,
    totalScore: 72,
    summary: "主干清楚。",
    strengths: v3.strengths,
    weaknesses: [
      { point: "工具协议的失败路径没答上", areaName: "项目深挖", kind: "missing", practice: "练一遍失败路径" },
      { point: "补一次数字口径", areaName: null, kind: "missing", practice: "" },
    ],
    hypotheses,
  });
});

test("bad, unknown or pre-v2 data returns null", () => {
  assert.equal(parseStoredReport(null), null);
  assert.equal(parseStoredReport("{ not json"), null);
  assert.equal(parseStoredReport(JSON.stringify({ totalScore: 1 })), null);
  assert.equal(parseStoredReport(JSON.stringify({ totalScore: 60, summary: "旧报告", strengths: [], improvements: [], actionPlan: [] })), null);
});
