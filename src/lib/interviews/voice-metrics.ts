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

function pauseSeconds(metrics: VoiceMetrics): number {
  if (metrics.pauseRatio >= 1) return Number.POSITIVE_INFINITY;
  return (
    (metrics.pauseRatio / (1 - metrics.pauseRatio)) *
    metrics.effectiveSpeakingSeconds
  );
}

export function mergeVoiceMetrics(
  existing: VoiceMetrics | null,
  incoming: VoiceMetrics | null,
): VoiceMetrics | null {
  if (!existing) return incoming ? { ...incoming } : null;
  if (!incoming) return { ...existing };

  const effectiveSpeakingSeconds =
    existing.effectiveSpeakingSeconds + incoming.effectiveSpeakingSeconds;
  const tokenCount = existing.tokenCount + incoming.tokenCount;
  const totalPauseSeconds = pauseSeconds(existing) + pauseSeconds(incoming);
  const fillerCount =
    existing.fillerDensity * existing.tokenCount +
    incoming.fillerDensity * incoming.tokenCount;

  return {
    candidateSpeaker:
      existing.candidateSpeaker === incoming.candidateSpeaker
        ? existing.candidateSpeaker
        : null,
    effectiveSpeakingSeconds,
    tokenCount,
    longPauseCount: existing.longPauseCount + incoming.longPauseCount,
    pauseRatio: Number.isFinite(totalPauseSeconds)
      ? totalPauseSeconds / (totalPauseSeconds + effectiveSpeakingSeconds)
      : 1,
    speakingRatePerMinute: effectiveSpeakingSeconds
      ? (tokenCount / effectiveSpeakingSeconds) * 60
      : 0,
    fillerDensity: tokenCount ? fillerCount / tokenCount : 0,
  };
}

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

/** 候选人应当明显比面试官说得多，接近就说明分不清。 */
const CANDIDATE_TALK_TIME_DOMINANCE = 1.5;

type SpeakerStats = { seconds: number; questions: number; segments: number };

function questionRatio(stats: SpeakerStats): number {
  return stats.segments ? stats.questions / stats.segments : 0;
}

/**
 * 说话人分离只给出匿名编号，这里从对话结构反推哪一位是候选人：面试里候选人的
 * 说话时间通常远多于面试官，而提问几乎都来自面试官。两个信号一致才返回结果；
 * 判不准时返回 null，宁可不产出语音指标，也不能把面试官的语速和停顿算到候选人头上。
 */
export function inferCandidateSpeaker(
  segments: TranscriptionSegment[],
): string | null {
  const stats = new Map<string, SpeakerStats>();
  for (const segment of segments) {
    if (!segment.speaker) continue;
    const entry = stats.get(segment.speaker) ?? {
      seconds: 0,
      questions: 0,
      segments: 0,
    };
    if (segment.start !== null && segment.end !== null && segment.end > segment.start) {
      entry.seconds += segment.end - segment.start;
    }
    if (/[?？]$/.test(segment.text.trim())) entry.questions += 1;
    entry.segments += 1;
    stats.set(segment.speaker, entry);
  }

  const ranked = [...stats.entries()].sort(
    (left, right) => right[1].seconds - left[1].seconds,
  );
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0]![0];

  const [topSpeaker, top] = ranked[0]!;
  const [, runnerUp] = ranked[1]!;
  if (top.seconds <= 0) return null;
  if (top.seconds < runnerUp.seconds * CANDIDATE_TALK_TIME_DOMINANCE) return null;
  // 说得最多的人反而提问比例最高，多半是话痨面试官，判不准。
  const rivalQuestionRatio = Math.max(
    ...ranked.slice(1).map(([, entry]) => questionRatio(entry)),
  );
  if (questionRatio(top) > rivalQuestionRatio) return null;
  return topSpeaker;
}

/**
 * 自动挑出候选人的声音并计算语音指标。单说话人（或没有分离信息）时整段都算
 * 候选人；多说话人且分不清时返回 null。
 */
export function deriveCandidateVoiceMetrics(
  segments: TranscriptionSegment[],
): VoiceMetrics | null {
  const speakers = [
    ...new Set(segments.flatMap((segment) => (segment.speaker ? [segment.speaker] : []))),
  ];
  if (speakers.length <= 1) {
    return deriveVoiceMetrics(segments, speakers[0] ?? null);
  }
  const candidateSpeaker = inferCandidateSpeaker(segments);
  return candidateSpeaker ? deriveVoiceMetrics(segments, candidateSpeaker) : null;
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
