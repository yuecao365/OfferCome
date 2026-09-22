/**
 * 面试报告的形状与读取。由汇总 agent 按面试全貌产出：两句总评，优点与短板各自挂在领域上，
 * 每条短板带一句练法，短板分说错 / 没答上 / 跨领域的模式，简历假设每条给一句结论。
 * v3（2026-09-20）把独立的 advice 并进短板；库里与体验版存档里的 v2 读出时在内存里升级，不改存档。
 */

import type { HypothesisSource } from "./brief/brief";

export const REPORT_VERSION = 3;

export const REPORT_WEAKNESS_KINDS = ["error", "missing", "pattern"] as const;
export type ReportWeaknessKind = (typeof REPORT_WEAKNESS_KINDS)[number];

export type HypothesisStatus = "open" | "confirmed" | "refuted";
/** source：简历上的说法 / 岗位要求；2026-09-22 之前的报告没有，按简历算。 */
export type ReportHypothesis = { text: string; source?: HypothesisSource; status: HypothesisStatus; verdict: string };

export type ReportWeakness = { point: string; areaName: string | null; kind: ReportWeaknessKind; practice: string };

export type MockInterviewReport = {
  version: typeof REPORT_VERSION;
  totalScore: number;
  summary: string;
  strengths: { point: string; areaName: string | null }[];
  weaknesses: ReportWeakness[];
  hypotheses: ReportHypothesis[];
};

type StoredV2 = Omit<MockInterviewReport, "version" | "weaknesses"> & {
  version: 2;
  weaknesses: Omit<ReportWeakness, "practice">[];
  advice: string[];
};

/** v2 的 advice 按顺序挂到短板上（当时的规则是每条建议对应一条短板）；多出的建议各自成一条 missing 短板。 */
function upgradeV2(report: StoredV2): MockInterviewReport {
  const weaknesses: ReportWeakness[] = report.weaknesses.map((item, index) => ({ ...item, practice: report.advice[index] ?? "" }));
  for (const advice of report.advice.slice(report.weaknesses.length)) weaknesses.push({ point: advice, areaName: null, kind: "missing", practice: "" });
  return { version: REPORT_VERSION, totalScore: report.totalScore, summary: report.summary, strengths: report.strengths, weaknesses, hypotheses: report.hypotheses };
}

/** 读库里 / 存档里的报告；v2 在内存里升级；更早的或坏数据返回 null。 */
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
  if (record.version === 2 && Array.isArray(record.weaknesses) && Array.isArray(record.advice)) return upgradeV2(record as StoredV2);
  return null;
}
