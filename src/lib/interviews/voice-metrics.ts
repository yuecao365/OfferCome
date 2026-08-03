import { z } from "zod";

export const transcriptionSegmentSchema = z.object({
  text: z.string(),
  start: z.number().nonnegative().nullable(),
  end: z.number().nonnegative().nullable(),
  speaker: z.string().nullable(),
});

export type TranscriptionSegment = z.infer<typeof transcriptionSegmentSchema>;

export type TranscriptionArtifact = {
  text: string;
  segments: TranscriptionSegment[];
  durationSeconds: number | null;
  speakers: string[];
  capabilities: {
    hasTimestamps: boolean;
    hasSpeakers: boolean;
    hasVoiceMetrics: boolean;
  };
};

export const voiceMetricsSchema = z.object({
  candidateSpeaker: z.string().nullable(),
  speakingRatePerMinute: z.number().nonnegative(),
  effectiveSpeakingSeconds: z.number().nonnegative(),
  pauseRatio: z.number().min(0).max(1),
  longPauseCount: z.number().int().nonnegative(),
  fillerDensity: z.number().min(0).max(1),
  tokenCount: z.number().int().nonnegative(),
});

export type VoiceMetrics = z.infer<typeof voiceMetricsSchema>;

const FILLER_PATTERN = /(?:嗯+|呃+|额+|然后|就是说|那个|这个|um+|uh+|like)/giu;

function speechTokenCount(text: string): number {
  const han = text.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  const words = text.match(/[\p{L}\p{N}]+/gu)?.filter(
    (token) => !/[\p{Script=Han}]/u.test(token),
  ).length ?? 0;
  return han + words;
}

export function deriveVoiceMetrics(
  segments: TranscriptionSegment[],
  candidateSpeaker: string | null,
): VoiceMetrics | null {
  const timed = segments.filter(
    (segment) =>
      segment.start !== null &&
      segment.end !== null &&
      segment.end >= segment.start &&
      (candidateSpeaker === null || segment.speaker === candidateSpeaker),
  );
  if (timed.length === 0) return null;

  const effectiveSpeakingSeconds = timed.reduce(
    (sum, segment) => sum + (segment.end! - segment.start!),
    0,
  );
  if (effectiveSpeakingSeconds <= 0) return null;
  const tokenCount = timed.reduce((sum, segment) => sum + speechTokenCount(segment.text), 0);
  const fillerCount = timed.reduce(
    (sum, segment) => sum + (segment.text.match(FILLER_PATTERN)?.length ?? 0),
    0,
  );
  let pauseSeconds = 0;
  let longPauseCount = 0;
  for (let index = 1; index < timed.length; index += 1) {
    const previous = timed[index - 1];
    const current = timed[index];
    // With diarization, a different-speaker turn is not a candidate pause.
    const originalPreviousIndex = segments.indexOf(previous);
    const originalCurrentIndex = segments.indexOf(current);
    if (originalCurrentIndex !== originalPreviousIndex + 1) continue;
    const gap = Math.max(0, current.start! - previous.end!);
    pauseSeconds += gap;
    if (gap >= 2) longPauseCount += 1;
  }

  return {
    candidateSpeaker,
    speakingRatePerMinute: (tokenCount / effectiveSpeakingSeconds) * 60,
    effectiveSpeakingSeconds,
    pauseRatio: pauseSeconds / (pauseSeconds + effectiveSpeakingSeconds),
    longPauseCount,
    fillerDensity: tokenCount ? fillerCount / tokenCount : 0,
    tokenCount,
  };
}

export function deriveDeliveryObservation(metricsJson: string): {
  score: number;
  confidence: number;
  summary: string;
} | null {
  const parsed = voiceMetricsSchema.safeParse(JSON.parse(metricsJson));
  if (!parsed.success || parsed.data.effectiveSpeakingSeconds < 20 || parsed.data.tokenCount < 20) {
    return null;
  }
  const metrics = parsed.data;
  let score = 3;
  if (metrics.speakingRatePerMinute >= 100 && metrics.speakingRatePerMinute <= 220) score += 0.5;
  if (metrics.speakingRatePerMinute < 70 || metrics.speakingRatePerMinute > 300) score -= 0.75;
  if (metrics.pauseRatio > 0.25) score -= 0.75;
  else if (metrics.pauseRatio < 0.12) score += 0.25;
  if (metrics.fillerDensity > 0.08) score -= 0.75;
  else if (metrics.fillerDensity > 0.04) score -= 0.25;
  const minutes = metrics.effectiveSpeakingSeconds / 60;
  if (minutes > 0 && metrics.longPauseCount / minutes > 2) score -= 0.5;
  score = Math.min(5, Math.max(1, score));
  const confidence = Math.min(0.95, 0.55 + Math.min(0.4, metrics.effectiveSpeakingSeconds / 600));
  return {
    score,
    confidence,
    summary: `有效讲话 ${Math.round(metrics.effectiveSpeakingSeconds)} 秒；语速 ${Math.round(metrics.speakingRatePerMinute)} 单位/分钟；停顿占比 ${Math.round(metrics.pauseRatio * 100)}%；长停顿 ${metrics.longPauseCount} 次；填充词密度 ${(metrics.fillerDensity * 100).toFixed(1)}%。`,
  };
}
