import assert from "node:assert/strict";
import test from "node:test";

import { deriveDeliveryObservation, deriveVoiceMetrics } from "./voice-metrics";

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
