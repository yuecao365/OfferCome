import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveCandidateVoiceMetrics,
  deriveDeliveryObservation,
  deriveVoiceMetrics,
  inferCandidateSpeaker,
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

test("infers the candidate from talk time and who asks the questions", () => {
  const speaker = inferCandidateSpeaker([
    { speaker: "speaker_1", start: 0, end: 8, text: "先介绍一下你的项目？" },
    { speaker: "speaker_0", start: 8, end: 48, text: "我负责整体设计，先做了容量评估" },
    { speaker: "speaker_1", start: 48, end: 54, text: "为什么这样取舍？" },
    { speaker: "speaker_0", start: 54, end: 96, text: "因为写多读少，所以选了异步落盘" },
  ]);
  assert.equal(speaker, "speaker_0");
});

test("refuses to guess when two speakers talk about equally", () => {
  const speaker = inferCandidateSpeaker([
    { speaker: "speaker_0", start: 0, end: 30, text: "我先说我的方案" },
    { speaker: "speaker_1", start: 30, end: 58, text: "我补充一个不同的思路" },
  ]);
  assert.equal(speaker, null);
});

test("refuses to guess when the longest talker is the one asking questions", () => {
  const speaker = inferCandidateSpeaker([
    { speaker: "speaker_0", start: 0, end: 40, text: "那你说说看这个怎么设计？" },
    { speaker: "speaker_1", start: 40, end: 50, text: "我会先拆成两层" },
  ]);
  assert.equal(speaker, null);
});

test("treats a single-speaker recording as entirely the candidate", () => {
  const metrics = deriveCandidateVoiceMetrics([
    { speaker: null, start: 0, end: 20, text: "我负责这个模块的性能优化" },
    { speaker: null, start: 20, end: 40, text: "先做了压测，然后定位到锁竞争" },
  ]);
  assert.equal(metrics?.effectiveSpeakingSeconds, 40);
});

test("drops voice metrics when the candidate speaker cannot be identified", () => {
  assert.equal(
    deriveCandidateVoiceMetrics([
      { speaker: "speaker_0", start: 0, end: 30, text: "我先说我的方案" },
      { speaker: "speaker_1", start: 30, end: 58, text: "我补充一个不同的思路" },
    ]),
    null,
  );
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
