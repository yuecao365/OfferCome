import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveDeliveryObservation,
  deriveVoiceMetrics,
  mergeVoiceMetrics,
  type VoiceMetrics,
} from "./voice-metrics";

const firstMetrics: VoiceMetrics = {
  candidateSpeaker: null,
  speakingRatePerMinute: 120,
  effectiveSpeakingSeconds: 30,
  pauseRatio: 0.25,
  longPauseCount: 1,
  fillerDensity: 0.1,
  tokenCount: 60,
};

test("derives metrics only for the selected speaker", () => {
  const metrics = deriveVoiceMetrics(
    [
      { speaker: "A", start: 0, end: 10, text: "我负责系统设计和交付结果" },
      { speaker: "B", start: 10, end: 20, text: "请说明你的取舍" },
      { speaker: "A", start: 20, end: 35, text: "我比较了两个方案，然后选择缓存方案" },
    ],
    "A",
  );
  assert.equal(metrics?.candidateSpeaker, "A");
  assert.equal(metrics?.effectiveSpeakingSeconds, 25);
  assert.equal(metrics?.longPauseCount, 0);
});

test("returns no voice metrics without timestamps", () => {
  assert.equal(
    deriveVoiceMetrics([{ speaker: null, start: null, end: null, text: "只有文本" }], null),
    null,
  );
});

test("requires enough recorded speech before producing a fluency observation", () => {
  const short = {
    candidateSpeaker: null,
    speakingRatePerMinute: 120,
    effectiveSpeakingSeconds: 5,
    pauseRatio: 0,
    longPauseCount: 0,
    fillerDensity: 0,
    tokenCount: 5,
  };
  assert.equal(deriveDeliveryObservation(JSON.stringify(short)), null);
});

test("mergeVoiceMetrics preserves a single recording", () => {
  assert.deepEqual(mergeVoiceMetrics(null, firstMetrics), firstMetrics);
  assert.deepEqual(mergeVoiceMetrics(firstMetrics, null), firstMetrics);
});

test("mergeVoiceMetrics recomputes rates and ratios across recordings", () => {
  const merged = mergeVoiceMetrics(firstMetrics, {
    candidateSpeaker: null,
    speakingRatePerMinute: 80,
    effectiveSpeakingSeconds: 30,
    pauseRatio: 0.5,
    longPauseCount: 2,
    fillerDensity: 0.05,
    tokenCount: 40,
  });

  assert.equal(merged?.effectiveSpeakingSeconds, 60);
  assert.equal(merged?.tokenCount, 100);
  assert.equal(merged?.longPauseCount, 3);
  assert.equal(merged?.speakingRatePerMinute, 100);
  assert.equal(merged?.pauseRatio, 0.4);
  assert.equal(merged?.fillerDensity, 0.08);
});
