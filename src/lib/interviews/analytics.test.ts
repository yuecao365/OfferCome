import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterviewConversionMetrics,
  buildInterviewHistorySummary,
  buildInterviewStageProgress,
  mergeInterviewRoundEvidence,
  toRealInterviewRoundCounts,
  toRealInterviewStatusCounts,
} from "./analytics";

const flow = {
  total: 25,
  pending: 8,
  assessment: 2,
  interviewOrLater: 10,
  rejected: 5,
  rounds: {
    firstInterview: 4,
    secondInterview: 2,
    thirdInterview: 1,
    hrInterview: 1,
    offer: 2,
  },
};

test("derives conservative reached-stage counts from a current snapshot", () => {
  assert.deepEqual(buildInterviewStageProgress(flow), {
    firstInterview: 10,
    secondInterview: 6,
    thirdInterview: 4,
    hrInterview: 3,
    offer: 2,
    rejected: 5,
  });
});

test("counts persisted real interview statuses without relabeling unknown data", () => {
  assert.deepEqual(
    toRealInterviewStatusCounts([
      { status: "scheduled", _count: { _all: 2 } },
      { status: "completed", _count: { _all: 3 } },
      { status: "cancelled", _count: { _all: 1 } },
      { status: "legacy", _count: { _all: 4 } },
    ]),
    { total: 10, scheduled: 2, completed: 3, canceled: 1 },
  );
});

test("uses real interview rounds as additional conservative stage evidence", () => {
  const rounds = toRealInterviewRoundCounts([
    { round: "first_interview", _count: { _all: 2 } },
    { round: "second_interview", _count: { _all: 1 } },
    { round: null, _count: { _all: 3 } },
  ]);
  const progress = mergeInterviewRoundEvidence(
    {
      firstInterview: 0,
      secondInterview: 0,
      thirdInterview: 0,
      hrInterview: 0,
      offer: 0,
      rejected: 0,
    },
    rounds,
  );

  assert.equal(progress.firstInterview, 3);
  assert.equal(progress.secondInterview, 1);
  assert.equal(progress.thirdInterview, 0);
  assert.equal(rounds.other, 3);
});

test("calculates explainable conversion metrics and handles empty denominators", () => {
  const progress = buildInterviewStageProgress(flow);
  const metrics = buildInterviewConversionMetrics(progress, {
    total: 6,
    scheduled: 2,
    completed: 3,
    canceled: 1,
  });

  assert.deepEqual(metrics.map((metric) => metric.value), [20, 60, 75]);
  assert.equal(
    buildInterviewConversionMetrics(
      { firstInterview: 0, secondInterview: 0, thirdInterview: 0, hrInterview: 0, offer: 0, rejected: 0 },
      { total: 0, scheduled: 0, completed: 0, canceled: 0 },
    )[0]?.value,
    null,
  );
});

test("does not invent a weakness when evidence is unavailable", () => {
  const summary = buildInterviewHistorySummary({
    realInterviewCounts: { total: 1, scheduled: 0, completed: 1, canceled: 0 },
    completedMockCount: 0,
    averageMockScore: null,
    progress: buildInterviewStageProgress(flow),
    insights: [],
  });

  assert.match(summary.body, /继续记录回答与复盘证据/);
  assert.doesNotMatch(summary.body, /薄弱|缺点/);
});

test("uses confirmed profile insights in the history summary", () => {
  const summary = buildInterviewHistorySummary({
    realInterviewCounts: { total: 3, scheduled: 0, completed: 2, canceled: 1 },
    completedMockCount: 2,
    averageMockScore: 82,
    progress: buildInterviewStageProgress(flow),
    insights: [
      {
        id: "strength",
        dimension: "knowledge_accuracy",
        kind: "strength",
        title: "技术原理表达清晰",
        statement: "能够解释关键技术取舍。",
        confidence: 0.9,
      },
      {
        id: "focus",
        dimension: "experience_evidence",
        kind: "training_focus",
        title: "补充行为案例细节",
        statement: "需要增加行动和结果证据。",
        confidence: 0.8,
      },
    ],
  });

  assert.match(summary.body, /技术原理表达清晰/);
  assert.match(summary.body, /补充行为案例细节/);
  assert.match(summary.body, /平均 82 分/);
});
