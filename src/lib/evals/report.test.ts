import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateEvalResults,
  percentile,
  renderEvalMarkdown,
  type CaseRunResult,
} from "./report";
import type { GraderVerdict } from "./types";

function verdict(grader: string, status: GraderVerdict["status"]): GraderVerdict {
  return { grader, status, detail: "" };
}

function result(overrides: Partial<CaseRunResult>): CaseRunResult {
  return {
    caseId: "case-a",
    direction: "backend",
    resume: "synthetic-backend",
    rep: 1,
    runId: "run",
    error: null,
    promptVersion: "v5",
    model: "gpt-test",
    totalTokens: 1_000,
    durationMs: 1_000,
    verdicts: [verdict("blueprint_level", "pass"), verdict("no_history_copy", "skip")],
    ...overrides,
  };
}

test("percentile picks nearest-rank values", () => {
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile([5, 1, 3], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
});

test("pass^k needs every repetition to pass and errors count as failures", () => {
  const report = aggregateEvalResults({
    id: "r1",
    tag: "eval-test",
    k: 2,
    results: [
      result({ caseId: "a", rep: 1 }),
      result({ caseId: "a", rep: 2 }),
      result({ caseId: "b", rep: 1 }),
      result({ caseId: "b", rep: 2, verdicts: [verdict("blueprint_level", "fail")] }),
      result({ caseId: "c", rep: 1, error: "model timeout", verdicts: [] }),
      result({ caseId: "c", rep: 2, durationMs: 9_000 }),
    ],
  });
  assert.equal(report.summary.caseCount, 3);
  assert.equal(report.summary.runCount, 6);
  assert.equal(report.summary.errorCount, 1);
  assert.equal(report.summary.runPassRate, 4 / 6);
  assert.equal(report.summary.passK, 1 / 3);
  assert.deepEqual(report.graders.blueprint_level, { pass: 4, fail: 1, skip: 0 });
  assert.equal(report.summary.msP95, 9_000);
  const b = report.cases.find((item) => item.caseId === "b")!;
  assert.deepEqual(b.reps.map((rep) => rep.pass), [true, false]);
  assert.deepEqual(b.reps[1].failed, ["blueprint_level"]);
});

test("markdown shows deltas against a baseline", () => {
  const baseline = aggregateEvalResults({
    id: "r0",
    tag: "eval-base",
    k: 1,
    results: [result({ caseId: "a", verdicts: [verdict("blueprint_level", "fail")] })],
  });
  const current = aggregateEvalResults({
    id: "r1",
    tag: "eval-now",
    k: 1,
    results: [result({ caseId: "a" })],
  });
  const markdown = renderEvalMarkdown(current, baseline);
  assert.match(markdown, /单次通过率 \| 100% \(\+100 pt\)/);
  assert.match(markdown, /blueprint_level \| 1 \| 0 \| 0 \| 100% \(\+100 pt\)/);
  assert.match(markdown, /\| a \| backend \| synthetic-backend \| ✓ \| - \|/);
});
