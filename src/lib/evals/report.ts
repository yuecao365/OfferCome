import { execSync } from "node:child_process";

/**
 * 评测产物的公共骨架：统计小函数、k 次复跑的区间、pass^k、markdown 表、两份产物的对比。
 * 纯函数；运行器只负责跑，数字都在这里算。
 */

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function stddev(values: number[]): number | null {
  const avg = mean(values);
  if (avg === null || values.length < 2) return values.length === 1 ? 0 : null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/** 比率指标：分子分母都留着，n 太小时读者自己能看出来。 */
export type Ratio = { value: number | null; numerator: number; denominator: number };

export function ratio(numerator: number, denominator: number): Ratio {
  return { value: denominator > 0 ? numerator / denominator : null, numerator, denominator };
}

export function ratioOf(flags: Array<boolean | null | undefined>): Ratio {
  const counted = flags.filter((flag): flag is boolean => typeof flag === "boolean");
  return ratio(counted.filter(Boolean).length, counted.length);
}

/** k 次复跑：均值与最小–最大。 */
export type Spread = { mean: number | null; min: number | null; max: number | null; n: number };

export function spread(values: Array<number | null>): Spread {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    mean: mean(present),
    min: present.length ? Math.min(...present) : null,
    max: present.length ? Math.max(...present) : null,
    n: present.length,
  };
}

/** 一个用例跑 k 次全部通过才算过。 */
export function passAtK(results: boolean[][]): Ratio {
  return ratio(results.filter((reps) => reps.length > 0 && reps.every(Boolean)).length, results.length);
}

export type MetricValue = number | Ratio | Spread | null;

export type RunEnvelope = {
  label: string;
  kind: "interviewer" | "scorer";
  createdAt: string;
  git: { commit: string; dirty: boolean };
  models: { main: string; aux: string; auxSameFamily: boolean };
  promptVersions: Record<string, string>;
  k: number;
};

export function gitState(): RunEnvelope["git"] {
  try {
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
    return { commit, dirty };
  } catch {
    return { commit: "unknown", dirty: false };
  }
}

function scalar(value: MetricValue): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  if ("value" in value) return value.value;
  return value.mean;
}

export function formatMetric(value: MetricValue): string {
  if (value === null) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if ("value" in value) {
    return value.value === null ? `— (0/${value.denominator})` : `${value.value.toFixed(2)} (${value.numerator}/${value.denominator})`;
  }
  if (value.mean === null) return "—";
  return value.n > 1 ? `${value.mean.toFixed(2)} [${value.min!.toFixed(2)}–${value.max!.toFixed(2)}]` : value.mean.toFixed(2);
}

export type MetricRow = { name: string; value: MetricValue; expect?: string; note?: string };

export function renderMetricTable(rows: MetricRow[]): string {
  const lines = ["| 指标 | 值 | 期望 | 备注 |", "|---|---|---|---|"];
  for (const row of rows) lines.push(`| ${row.name} | ${formatMetric(row.value)} | ${row.expect ?? ""} | ${row.note ?? ""} |`);
  return lines.join("\n");
}

/** 两份产物的同名指标差；只比能压成一个数的。 */
export function compareMetrics(a: Record<string, MetricValue>, b: Record<string, MetricValue>): string {
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const lines = ["| 指标 | A | B | Δ (B−A) |", "|---|---|---|---|"];
  for (const name of names) {
    const left = scalar(a[name] ?? null);
    const right = scalar(b[name] ?? null);
    const delta = left !== null && right !== null ? (right - left).toFixed(3) : "—";
    lines.push(`| ${name} | ${formatMetric(a[name] ?? null)} | ${formatMetric(b[name] ?? null)} | ${delta} |`);
  }
  return lines.join("\n");
}
