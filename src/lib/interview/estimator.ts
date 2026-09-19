/**
 * 能力估计（报告页的"能力估计"栏）：每段问答是一次测量——难度是答到阶梯第几层，结果是评分与置信；每项能力一个 Beta 后验。
 * 纯函数；面试后用切段与评分算（queries.buildEstimates）。面试中的在线估计、跨场先验与现场卡提示已随实验层删除（重建 v5 §7）。
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
  /** 0–1：n / (n + 2)，n 是置信加权的测量数。 */
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

export function estimate(competencies: Competency[], observations: Observation[]): Estimate[] {
  return competencies.map((competency) => {
    let alpha = PRIOR.alpha;
    let beta = PRIOR.beta;
    let weight = 0;
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

export function levelLabel(value: number): string {
  return value < 0.4 ? "低" : value < 0.7 ? "中" : "高";
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

/**
 * 秩相关（Spearman）：只看排序对不对，不受"估计值和真值不同尺度"影响。
 * 估计值被提问深度压住上限（evidenceOf），跟真值档位不可直接相减，所以对照表用这个当主指标。
 */
export function spearman(pairs: [number, number][]): number | null {
  if (pairs.length < 2) return null;
  const rank = (values: number[]): number[] => {
    const order = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
    const ranks = new Array<number>(values.length);
    for (let start = 0; start < order.length; ) {
      // 并列取平均秩，否则大量同分（真值只有三档）会把相关算歪。
      let end = start;
      while (end + 1 < order.length && order[end + 1].value === order[start].value) end += 1;
      const mean = (start + end) / 2 + 1;
      for (let index = start; index <= end; index += 1) ranks[order[index].index] = mean;
      start = end + 1;
    }
    return ranks;
  };
  const xs = rank(pairs.map(([x]) => x));
  const ys = rank(pairs.map(([, y]) => y));
  return pearson(xs.map((x, index) => [x, ys[index]] as [number, number]));
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
