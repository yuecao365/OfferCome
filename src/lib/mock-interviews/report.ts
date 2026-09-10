import type { HypothesisStatus } from "./interviewer/memory";

/**
 * 面试报告的形状与读取。v2 由汇总 agent 按面试全貌产出：优点与短板各自挂在领域上，
 * 短板分说错 / 没答上 / 跨领域的模式，简历假设每条给一句结论。库里的 v1 报告已一次性升成 v2。
 */

export const REPORT_VERSION = 2;

export const REPORT_WEAKNESS_KINDS = ["error", "missing", "pattern"] as const;
export type ReportWeaknessKind = (typeof REPORT_WEAKNESS_KINDS)[number];

export type ReportHypothesis = { text: string; status: HypothesisStatus; verdict: string };

export type MockInterviewReport = {
  version: typeof REPORT_VERSION;
  totalScore: number;
  summary: string;
  strengths: { point: string; areaName: string | null }[];
  weaknesses: { point: string; areaName: string | null; kind: ReportWeaknessKind }[];
  advice: string[];
  hypotheses: ReportHypothesis[];
};

/** 读库里 / 存档里的报告；坏数据返回 null。 */
export function parseStoredReport(json: string | null | undefined): MockInterviewReport | null {
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return record.version === REPORT_VERSION ? (record as MockInterviewReport) : null;
}
