import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateProfileDimension,
  deriveInsightStatus,
  isAssessableAnswer,
  profileEvidenceWeight,
  profileSourceWeight,
  sanitizeInsightText,
  timeDecayWeight,
  type AggregationObservation,
} from "./rules";

test("keyboard mashing and one-word answers are not assessable", () => {
  assert.equal(isAssessableAnswer("asdfasdfadf"), false);
  assert.equal(isAssessableAnswer("是的，我做过。"), false);
  assert.equal(isAssessableAnswer("aaaaaaaaaaaaaaaaaaaaaaaaaaaa"), false);
  assert.equal(
    isAssessableAnswer("哈希表主要是一个数据结构，它进行了 Key 和 Value 的配对。"),
    true,
  );
});

test("internal ids are stripped from insight prose", () => {
  assert.equal(
    sanitizeInsightText(
      "候选人在多个问题中回答内容与问题高度不匹配（见cmsxc25hu009drktakvddqpbg等9条低分观察，均为1分）。建议专注于理解问题本身。",
    ),
    "候选人在多个问题中回答内容与问题高度不匹配。建议专注于理解问题本身。",
  );
  assert.equal(
    sanitizeInsightText("参考 cmsx92vpu000jrktamd7v55jl 的表述，逻辑不够紧凑。"),
    "参考 的表述，逻辑不够紧凑。",
  );
  assert.equal(sanitizeInsightText("回答相关度高，基础扎实。"), "回答相关度高，基础扎实。");
});

const now = new Date("2026-07-22T00:00:00.000Z");

function observation(input: Partial<AggregationObservation> = {}): AggregationObservation {
  return {
    interviewId: "interview-1",
    interviewDate: now,
    dimension: "answer_relevance",
    score: 3,
    modelConfidence: 1,
    sourceType: "real_transcript",
    ...input,
  };
}

test("uses the fixed source weights", () => {
  assert.equal(profileSourceWeight("real_audio"), 1);
  assert.equal(profileSourceWeight("real_transcript"), 0.9);
  assert.equal(profileSourceWeight("real_summary"), 0.75);
  assert.equal(profileSourceWeight("mock_text"), 0.5);
  assert.equal(profileEvidenceWeight("mock"), 0.5);
  assert.ok(profileSourceWeight("real_summary") > profileSourceWeight("mock_text"));
});

test("lets real interview evidence influence the profile more than AI simulation", () => {
  const metric = aggregateProfileDimension(
    "answer_relevance",
    [
      observation({
        interviewId: "real",
        score: 5,
        sourceType: "real_transcript",
      }),
      observation({
        interviewId: "mock",
        score: 1,
        sourceType: "mock_text",
      }),
    ],
    now,
  );

  assert.ok(metric.level !== null && metric.level > 3);
  assert.equal(metric.realInterviewCount, 1);
});

test("applies a 180-day half life", () => {
  assert.equal(timeDecayWeight(new Date("2026-01-23T00:00:00.000Z"), now), 0.5);
});

test("caps each interview to one aggregate point and keeps N/A out of the score", () => {
  const repeated = Array.from({ length: 10 }, (_, index) =>
    observation({ score: index % 2 ? 5 : 1 }),
  );
  const metric = aggregateProfileDimension("answer_relevance", repeated, now);
  assert.equal(metric.interviewCount, 1);
  assert.equal(metric.evidenceCount, 10);
  // 门槛下放：1 场面试即给出等级（展示层按 interviewCount 标注"初步"）。
  assert.equal(metric.levelLabel, "熟练");
  const notApplicable = aggregateProfileDimension("knowledge_accuracy", repeated, now);
  assert.equal(notApplicable.level, null);
  assert.equal(notApplicable.evidenceCount, 0);
});

test("weights recent interviews more heavily without erasing older evidence", () => {
  const metric = aggregateProfileDimension(
    "answer_relevance",
    [
      observation({ interviewId: "old", interviewDate: new Date("2025-07-22"), score: 1 }),
      observation({ interviewId: "new", score: 5 }),
    ],
    now,
  );
  assert.ok(metric.level !== null && metric.level > 4);
  assert.equal(metric.interviewCount, 2);
});

test("requires three dates and a 0.25-level estimated change for trend", () => {
  const rising = aggregateProfileDimension(
    "answer_relevance",
    [
      observation({ interviewId: "one", interviewDate: new Date("2026-01-01"), score: 2 }),
      observation({ interviewId: "two", interviewDate: new Date("2026-03-01"), score: 3 }),
      observation({ interviewId: "three", interviewDate: new Date("2026-06-01"), score: 4 }),
    ],
    now,
  );
  assert.equal(rising.trend, "up");
  const insufficient = aggregateProfileDimension(
    "answer_relevance",
    [observation({ interviewId: "one" }), observation({ interviewId: "two" })],
    now,
  );
  assert.equal(insufficient.trend, "insufficient");
});

test("excludes user-rejected evidence and never creates text-only fluency", () => {
  const excluded = aggregateProfileDimension(
    "answer_relevance",
    [observation({ status: "excluded", score: 5 }), observation({ interviewId: "kept", score: 2 })],
    now,
  );
  assert.equal(excluded.interviewCount, 1);
  assert.equal(excluded.level, 2);
  const fluency = aggregateProfileDimension("delivery_fluency", [observation()], now);
  assert.equal(fluency.level, null);
});

test("keeps single-session insights tentative and user-confirmed insights active", () => {
  assert.equal(
    deriveInsightStatus({ isUserLocked: false, confidence: 0.95, supportingInterviewIds: ["one"] }),
    "tentative",
  );
  assert.equal(
    deriveInsightStatus({ isUserLocked: true, confidence: 0.2, supportingInterviewIds: [] }),
    "active",
  );
});
