import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_TREND_RANGE_OPTIONS,
  buildApplicationStageChartData,
  buildApplicationTrend,
  buildCareerFlowSnapshot,
  getApplicationTrendStart,
  parseApplicationTrendRange,
  toApplicationStageCounts,
} from "./analytics";

test("builds a fourteen-day daily trend with empty days preserved", () => {
  const start = getApplicationTrendStart(new Date(2026, 6, 20, 12), "14d");
  const trend = buildApplicationTrend(
    [
      new Date(2026, 6, 7, 9),
      new Date(2026, 6, 7, 18),
      new Date(2026, 6, 20, 12),
    ],
    start,
    "14d",
  );

  assert.equal(trend.length, 14);
  assert.deepEqual(trend[0], {
    periodStart: "2026-07-07",
    label: "7/7",
    count: 2,
  });
  assert.equal(trend[1]?.count, 0);
  assert.deepEqual(trend[13], {
    periodStart: "2026-07-20",
    label: "7/20",
    count: 1,
  });
});

test("builds an all-zero daily trend when the selected range has no applications", () => {
  const start = getApplicationTrendStart(new Date(2026, 6, 20, 12), "14d");
  const trend = buildApplicationTrend([], start, "14d");

  assert.equal(trend.length, 14);
  assert.ok(trend.every((point) => point.count === 0));
  assert.equal(trend[0]?.label, "7/7");
  assert.equal(trend[13]?.label, "7/20");
});

test("adapts ninety days to weeks and one year to months", () => {
  const weekly = buildApplicationTrend(
    [new Date(2026, 0, 1), new Date(2026, 0, 7), new Date(2026, 0, 8)],
    new Date(2026, 0, 1),
    "90d",
  );
  assert.equal(weekly.length, 13);
  assert.deepEqual(weekly.slice(0, 2), [
    { periodStart: "2026-01-01", label: "1/1–1/7", count: 2 },
    { periodStart: "2026-01-08", label: "1/8–1/14", count: 1 },
  ]);
  assert.equal(weekly[12]?.label, "3/26–3/31");

  const yearlyStart = getApplicationTrendStart(new Date(2026, 6, 20), "365d");
  const monthly = buildApplicationTrend(
    [new Date(2025, 7, 3), new Date(2026, 6, 20)],
    yearlyStart,
    "365d",
  );
  assert.equal(monthly.length, 12);
  assert.deepEqual(monthly[0], {
    periodStart: "2025-08-01",
    label: "25/8",
    count: 1,
  });
  assert.deepEqual(monthly[11], {
    periodStart: "2026-07-01",
    label: "26/7",
    count: 1,
  });
});

test("parses supported trend ranges and exposes adaptive granularities", () => {
  assert.equal(parseApplicationTrendRange("90d"), "90d");
  assert.equal(parseApplicationTrendRange("invalid"), "14d");
  assert.deepEqual(
    APPLICATION_TREND_RANGE_OPTIONS.map(({ value, granularity }) => ({
      value,
      granularity,
    })),
    [
      { value: "14d", granularity: "day" },
      { value: "30d", granularity: "day" },
      { value: "90d", granularity: "week" },
      { value: "365d", granularity: "month" },
    ],
  );
});

test("builds a complete stage snapshot from persisted groups", () => {
  const counts = toApplicationStageCounts([
    { stage: "applied", _count: { _all: 8 } },
    { stage: "first_interview", _count: { _all: 4 } },
    { stage: "second_interview", _count: { _all: 2 } },
    { stage: "offer", _count: { _all: 1 } },
    { stage: "rejected", _count: { _all: 5 } },
  ]);

  assert.equal(counts.third_interview, 0);
  assert.deepEqual(buildCareerFlowSnapshot(counts), {
    total: 20,
    pending: 8,
    assessment: 0,
    interviewOrLater: 7,
    rejected: 5,
    rounds: {
      firstInterview: 4,
      secondInterview: 2,
      thirdInterview: 0,
      hrInterview: 0,
      offer: 1,
    },
  });
});

test("builds stage chart data", () => {
  const counts = toApplicationStageCounts([
    { stage: "applied", _count: { _all: 8 } },
    { stage: "first_interview", _count: { _all: 3 } },
    { stage: "offer", _count: { _all: 1 } },
    { stage: "rejected", _count: { _all: 2 } },
  ]);

  assert.equal(buildApplicationStageChartData(counts)[2]?.label, "一面");
  assert.equal(buildApplicationStageChartData(counts)[2]?.count, 3);
});

test("keeps unknown legacy stages in the pending bucket", () => {
  const counts = toApplicationStageCounts([
    { stage: "legacy", _count: { _all: 3 } },
    { stage: null, _count: { _all: 2 } },
  ]);

  assert.equal(counts.applied, 5);
});
