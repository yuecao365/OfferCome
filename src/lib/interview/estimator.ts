import type { InterviewEvent } from "./events";

/**
 * 能力估计器（interview-system-design.md §6.1 的最简版本）：把面试当自适应测验。
 * 每段问答是一次测量——难度是答到阶梯第几层，结果是评委的分数与置信；每项能力一个 Beta 后验，
 * 输出"最值得追 / 已足够确定"一行给面试官（怎么问它定）。纯函数；面试中从 segment_scored 现算，
 * 事后用整理员的分段与双采样评分再算一遍。
 */

export type Competency = { id: string; name: string; priority: "core" | "secondary"; /** 蓝图里的一句描述（模拟器按它对题）。 */ description?: string };

export type Observation = {
  competencyId: string;
  /** 答到阶梯第几层：1 只到概念，4 到最深的机制与取舍。 */
  difficulty: number;
  /** 0–100。 */
  score: number;
  /** 评委对这次测量的把握，0–1。 */
  confidence: number;
};

export type Estimate = {
  competencyId: string;
  name: string;
  /** 岗位权重：core 1、secondary 0.6。 */
  weight: number;
  /** 0–1 的能力估计（Beta 后验均值；没有测量也没有先验时 0.5）。 */
  mean: number;
  /** 0–1：n / (n + 2)，n 是置信加权的测量数（含跨场先验的伪计数）。 */
  confidence: number;
  samples: number;
};

export const DIFFICULTY_LEVELS = 4;
/** 置信到这里算"足够确定"（约三段有效问答）。 */
export const CONFIDENT = 0.6;
const WEIGHT: Record<Competency["priority"], number> = { core: 1, secondary: 0.6 };
const PRIOR = { alpha: 1, beta: 1 };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** 一段折成能力证据：低层答满 ≈ 0.25，最高层答满 ≈ 1。 */
export function evidenceOf(observation: Observation): number {
  const level = clamp(Math.round(observation.difficulty), 1, DIFFICULTY_LEVELS);
  return (level - 1 + clamp(observation.score, 0, 100) / 100) / DIFFICULTY_LEVELS;
}

/** 跨场先验（memory.priorsFrom）：上几场折成的伪计数，加在 Beta(1, 1) 上。 */
export type Prior = { competencyId: string; alpha: number; beta: number };

export function estimate(competencies: Competency[], observations: Observation[], priors: Prior[] = []): Estimate[] {
  return competencies.map((competency) => {
    const prior = priors.find((item) => item.competencyId === competency.id);
    let alpha = PRIOR.alpha + (prior?.alpha ?? 0);
    let beta = PRIOR.beta + (prior?.beta ?? 0);
    let weight = (prior?.alpha ?? 0) + (prior?.beta ?? 0);
    let samples = 0;
    for (const observation of observations) {
      if (observation.competencyId !== competency.id) continue;
      const confidence = clamp(observation.confidence, 0, 1);
      const evidence = evidenceOf(observation);
      alpha += confidence * evidence;
      beta += confidence * (1 - evidence);
      weight += confidence;
      samples += 1;
    }
    return { competencyId: competency.id, name: competency.name, weight: WEIGHT[competency.priority], mean: alpha / (alpha + beta), confidence: weight / (weight + 2), samples };
  });
}

/** 面试中的测量：segment_scored 事件。 */
export function observationsFromEvents(events: InterviewEvent[]): Observation[] {
  return events.flatMap((item) => (item.type === "segment_scored" ? [{ competencyId: item.payload.competencyId, difficulty: item.payload.difficulty, score: item.payload.score, confidence: item.payload.confidence }] : []));
}

/** 下一个最值得追的能力：权重 × 不确定性最大的那项；都足够确定为 null。 */
export function nextToProbe(estimates: Estimate[]): Estimate | null {
  const open = estimates.filter((item) => item.confidence < CONFIDENT);
  if (open.length === 0) return null;
  return open.reduce((best, item) => (item.weight * (1 - item.confidence) > best.weight * (1 - best.confidence) ? item : best));
}

/** 停止规则的一半：核心能力都足够确定（另一半是时间到了）。 */
export function coreSettled(estimates: Estimate[]): boolean {
  const core = estimates.filter((item) => item.weight === WEIGHT.core);
  return core.length > 0 && core.every((item) => item.confidence >= CONFIDENT);
}

export function levelLabel(value: number): string {
  return value < 0.4 ? "低" : value < 0.7 ? "中" : "高";
}

function describe(item: Estimate): string {
  return `${item.name}（估计 ${levelLabel(item.mean)}，置信 ${levelLabel(item.confidence)}，岗位权重 ${item.weight >= WEIGHT.core ? "高" : "中"}）`;
}

/** 现场卡上的一行；没有能力清单时为 null。 */
export function estimateLine(estimates: Estimate[]): string | null {
  if (estimates.length === 0) return null;
  if (coreSettled(estimates)) return "能力估计：核心能力都已足够确定，剩下的时间可以收尾。";
  const next = nextToProbe(estimates);
  const settled = estimates.filter((item) => item.confidence >= CONFIDENT);
  const parts = [next ? `最值得追：${describe(next)}` : null, settled.length > 0 ? `已足够确定：${settled.map(describe).join("、")}` : null].filter((part): part is string => part !== null);
  return `能力估计：${parts.join("；")}。`;
}

/** 测过的能力的（估计，真值）对；评测用，跨场合并后算相关。 */
export function estimatePairs(estimates: Estimate[], truth: { competencyId: string; level: number }[]): [number, number][] {
  return estimates.filter((item) => item.samples > 0).flatMap((item) => {
    const known = truth.find((entry) => entry.competencyId === item.competencyId);
    return known ? [[item.mean, known.level] as [number, number]] : [];
  });
}

/** 估计与真值的相关（只算测过的能力）；不足两项或没有方差为 null。 */
export function correlation(estimates: Estimate[], truth: { competencyId: string; level: number }[]): number | null {
  return pearson(estimatePairs(estimates, truth));
}

export function pearson(pairs: [number, number][]): number | null {
  if (pairs.length < 2) return null;
  const meanOf = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const mx = meanOf(xs);
  const my = meanOf(ys);
  const cov = pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  const vx = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  const vy = ys.reduce((sum, y) => sum + (y - my) ** 2, 0);
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}
