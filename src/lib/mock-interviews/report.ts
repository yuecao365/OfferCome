import type { HypothesisStatus } from "./interviewer/memory";

/**
 * 面试报告的形状与读取。v2 由汇总 agent 按面试全貌产出：优点与短板各自挂在领域上，
 * 短板分说错 / 没答上 / 跨领域的模式，简历假设每条给一句结论。
 * v1（旧报告与体验版存储）只有 strengths / improvements / actionPlan，读出时映射成 v2。
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

/** 旧报告形状；体验版的浏览器存储仍用它。 */
export type LegacyMockInterviewReport = {
  totalScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  actionPlan: string[];
};

export function fromLegacyReport(legacy: LegacyMockInterviewReport): MockInterviewReport {
  return {
    version: REPORT_VERSION,
    totalScore: legacy.totalScore,
    summary: legacy.summary,
    strengths: legacy.strengths.map((point) => ({ point, areaName: null })),
    weaknesses: [],
    advice: [...legacy.improvements, ...legacy.actionPlan],
    hypotheses: [],
  };
}

/** 给体验版存储用：把 v2 折回旧形状，界面与存档不动。 */
export function toLegacyReport(report: MockInterviewReport): LegacyMockInterviewReport {
  return {
    totalScore: report.totalScore,
    summary: report.summary,
    strengths: report.strengths.map((item) => item.point),
    improvements: report.weaknesses.map((item) => item.point),
    actionPlan: report.advice,
  };
}

function isLegacy(value: Record<string, unknown>): value is LegacyMockInterviewReport & Record<string, unknown> {
  return Array.isArray(value.improvements) && Array.isArray(value.actionPlan);
}

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
  if (record.version === REPORT_VERSION) return record as MockInterviewReport;
  return isLegacy(record) ? fromLegacyReport(record) : null;
}
