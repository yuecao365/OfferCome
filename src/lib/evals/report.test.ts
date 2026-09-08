import assert from "node:assert/strict";
import test from "node:test";

import { compareMetrics, formatMetric, passAtK, percentile, ratio, ratioOf, spread, stddev } from "./report";

test("ratioOf skips nulls and keeps numerator and denominator", () => {
  assert.deepEqual(ratioOf([true, false, null, true]), { value: 2 / 3, numerator: 2, denominator: 3 });
  assert.deepEqual(ratioOf([]), { value: null, numerator: 0, denominator: 0 });
});

test("spread reports mean and range over k reps and ignores nulls", () => {
  assert.deepEqual(spread([0.5, null, 0.7]), { mean: 0.6, min: 0.5, max: 0.7, n: 2 });
  assert.deepEqual(spread([]), { mean: null, min: null, max: null, n: 0 });
});

test("passAtK requires every rep of a case to pass", () => {
  assert.deepEqual(passAtK([[true, true], [true, false], []]), { value: 1 / 3, numerator: 1, denominator: 3 });
});

test("stddev and percentile behave on small samples", () => {
  assert.equal(stddev([5]), 0);
  assert.equal(stddev([]), null);
  assert.ok(Math.abs(stddev([2, 4, 4, 4, 5, 5, 7, 9])! - 2.138) < 0.01);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([], 50), null);
});

test("formatMetric renders numbers, ratios and spreads for the markdown table", () => {
  assert.equal(formatMetric(null), "—");
  assert.equal(formatMetric(3), "3");
  assert.equal(formatMetric(ratio(1, 4)), "0.25 (1/4)");
  assert.equal(formatMetric(ratio(0, 0)), "— (0/0)");
  assert.equal(formatMetric(spread([0.5, 0.7])), "0.60 [0.50–0.70]");
  assert.equal(formatMetric(spread([0.5])), "0.50");
});

test("compareMetrics prints deltas only where both sides are numeric", () => {
  const table = compareMetrics({ a: ratio(1, 2), b: 3, c: null }, { a: ratio(3, 4), b: 3, d: spread([1]) });
  assert.match(table, /\| a \| 0\.50 \(1\/2\) \| 0\.75 \(3\/4\) \| 0\.250 \|/);
  assert.match(table, /\| b \| 3 \| 3 \| 0\.000 \|/);
  assert.match(table, /\| c \| — \| — \| — \|/);
  assert.match(table, /\| d \| — \| 1\.00 \| — \|/);
});
