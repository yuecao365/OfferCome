import assert from "node:assert/strict";
import test from "node:test";

import { allSkippedSummary, cleanHypothesisVerdict, validateSummary } from "./outcome";
import type { SummaryInput } from "./summary-agent";

test("hypothesis verdicts lose a leading status word (Chinese rules unchanged)", () => {
  assert.equal(cleanHypothesisVerdict("refuted：没有讲清楚基线。"), "没有讲清楚基线。");
  assert.equal(cleanHypothesisVerdict("已验证，主循环讲到了实现细节。"), "主循环讲到了实现细节。");
});

test("English hypothesis verdicts lose labelled or bracketed status words but keep ordinary sentences", () => {
  assert.equal(cleanHypothesisVerdict("Confirmed: walked through the retry path in detail.", "en"), "Walked through the retry path in detail.");
  assert.equal(cleanHypothesisVerdict("[Refuted] couldn't explain how the baseline was measured.", "en"), "Couldn't explain how the baseline was measured.");
  assert.equal(cleanHypothesisVerdict("**Refuted** — the baseline wasn't explained clearly.", "en"), "The baseline wasn't explained clearly.");
  assert.equal(cleanHypothesisVerdict("Status: partially confirmed - needs more evidence on scale.", "en"), "Needs more evidence on scale.");
  assert.equal(cleanHypothesisVerdict("Open source work came up in the second project.", "en"), "Open source work came up in the second project.");
});

const input: SummaryInput = {
  jobTitle: "Agent Engineer",
  pace: "standard",
  areas: [{ name: "Agent harness", kind: "project", weight: 3, depthReached: 2, skipped: false, score: 72, weaknesses: [] }],
  notes: "",
  hypotheses: [
    { text: "Led the harness rewrite", source: "resume" },
    { text: "Can design an eval pipeline", source: "jd" },
  ],
};

test("English summaries: unreached hypotheses get the fixed English verdict, missing ones are filled in", () => {
  const summary = validateSummary(
    {
      summary: "Solid on the main loop. Lost the thread on failure handling.",
      strengths: [{ point: "Clear loop design", areaName: "Agent harness" }],
      weaknesses: [{ point: "Retries recur everywhere", areaName: "Nowhere", kind: "pattern", practice: "Rehearse the retry path" }],
      hypotheses: [{ text: "Led the harness rewrite", status: "confirmed", verdict: "Confirmed: explained the design trade-offs first-hand." }],
    },
    input,
    "en",
  );
  assert.deepEqual(summary.weaknesses, [{ point: "Retries recur everywhere", areaName: null, kind: "missing", practice: "Rehearse the retry path" }]);
  assert.deepEqual(summary.hypotheses, [
    { text: "Led the harness rewrite", source: "resume", status: "confirmed", verdict: "Explained the design trade-offs first-hand." },
    { text: "Can design an eval pipeline", source: "jd", status: "open", verdict: "Not covered in this interview." },
  ]);
  assert.equal(validateSummary({ summary: "", strengths: [], weaknesses: [], hypotheses: [] }, input).hypotheses[0].verdict, "这场没有问到。");
});

test("the all-skipped report follows the session language", () => {
  assert.equal(allSkippedSummary().summary, "本场所有题目均已跳过，暂时没有可评分的回答。");
  assert.equal(allSkippedSummary("en").weaknesses[0].point, "No questions were answered");
});
