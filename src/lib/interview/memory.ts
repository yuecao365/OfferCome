import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { questionSimilarity } from "@/lib/text/similarity";

import type { Prior } from "./estimator";

/**
 * 语义记忆（interview-system-design.md §8 第三层）：候选人的说法 ↔ 证据 ↔ 能力，跨场。
 * 记忆本身是对已有产物（假设验证、事后能力估计、评分短板、问过的题）的读时物化，见 memory-recall.ts；
 * 这里是纯函数：时间衰减、跨场先验、说法的历史（含冲突）、检索、写给面试官的一段。
 */

export type MemoryClaim = { text: string; evidence: string; status: "confirmed" | "refuted"; note: string | null; at: string };
export type MemoryCompetency = { competencyId: string; mean: number; confidence: number; samples: number; at: string };
export type MemoryWeakness = { point: string; quote: string | null; areaName: string | null; at: string };
export type MemoryQuestion = { text: string; at: string };

export type InterviewMemory = {
  /** 记忆来自几场。 */
  sessions: number;
  claims: MemoryClaim[];
  competencies: MemoryCompetency[];
  weaknesses: MemoryWeakness[];
  askedQuestions: MemoryQuestion[];
};

export const EMPTY_MEMORY: InterviewMemory = { sessions: 0, claims: [], competencies: [], weaknesses: [], askedQuestions: [] };

export const HALF_LIFE_DAYS = 30;
/** 每场每项能力最多折成这么多伪计数：上几场再确定也不该压过这场的测量。 */
const MAX_PRIOR_PER_SESSION = 3;
/** 说法对上上几场说法的相似度门槛（简历原句几乎一样）。 */
const CLAIM_MATCH = 0.6;
const SEARCH_MIN = 0.15;

/** 会话快照里的记忆；没有为空。 */
export function memoryOf(contextSnapshotJson: string | null | undefined): InterviewMemory {
  try {
    const parsed = JSON.parse(contextSnapshotJson ?? "{}") as { memory?: Partial<InterviewMemory> | null };
    const memory = parsed.memory;
    if (!memory || typeof memory !== "object") return EMPTY_MEMORY;
    return {
      sessions: typeof memory.sessions === "number" ? memory.sessions : 0,
      claims: Array.isArray(memory.claims) ? memory.claims : [],
      competencies: Array.isArray(memory.competencies) ? memory.competencies : [],
      weaknesses: Array.isArray(memory.weaknesses) ? memory.weaknesses : [],
      askedQuestions: Array.isArray(memory.askedQuestions) ? memory.askedQuestions : [],
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

/** 时间衰减：半衰期 30 天。 */
export function decay(at: string, now: Date = new Date()): number {
  const days = Math.max(0, (now.getTime() - new Date(at).getTime()) / 86_400_000);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/** 上几场的事后估计 → 这场的 Beta 伪计数（样本数 × 衰减，每场每项最多 3）。 */
export function priorsFrom(memory: InterviewMemory, now: Date = new Date()): Prior[] {
  const byCompetency = new Map<string, Prior>();
  for (const item of memory.competencies) {
    const weight = Math.min(MAX_PRIOR_PER_SESSION, item.samples) * decay(item.at, now);
    if (weight <= 0) continue;
    const prior = byCompetency.get(item.competencyId) ?? { competencyId: item.competencyId, alpha: 0, beta: 0 };
    prior.alpha += weight * item.mean;
    prior.beta += weight * (1 - item.mean);
    byCompetency.set(item.competencyId, prior);
  }
  return [...byCompetency.values()];
}

export type ClaimHistory = { hypothesisId: string; status: "confirmed" | "refuted" | "conflict"; note: string | null; at: string };

/** 这场简报里的每条假设在上几场的结论：按简历原句相似度对上；前后场结论相反算冲突。 */
export function claimHistory(hypotheses: InterviewBrief["hypotheses"], memory: InterviewMemory): ClaimHistory[] {
  return hypotheses.flatMap((hypothesis) => {
    const matched = memory.claims
      .filter((claim) => questionSimilarity(claim.evidence, hypothesis.evidence) >= CLAIM_MATCH || questionSimilarity(claim.text, hypothesis.text) >= CLAIM_MATCH)
      .sort((left, right) => right.at.localeCompare(left.at));
    if (matched.length === 0) return [];
    const latest = matched[0];
    const conflict = matched.some((claim) => claim.status !== latest.status);
    return [{ hypothesisId: hypothesis.id, status: conflict ? "conflict" : latest.status, note: latest.note, at: latest.at }];
  });
}

export type MemoryHit = { kind: "claim" | "weakness" | "question"; text: string; status: string | null; at: string; score: number };

/** 按相似度在说法、短板、问过的题里找（字符 n-gram；材料小，不上向量）。 */
export function searchMemory(memory: InterviewMemory, query: string, limit = 6): MemoryHit[] {
  const candidates: MemoryHit[] = [
    ...memory.claims.map((claim) => ({ kind: "claim" as const, text: `${claim.text}（简历：「${claim.evidence}」${claim.note ? `；${claim.note}` : ""}）`, status: claim.status, at: claim.at, score: Math.max(questionSimilarity(query, claim.text), questionSimilarity(query, claim.evidence)) })),
    ...memory.weaknesses.map((item) => ({ kind: "weakness" as const, text: `${item.areaName ? `${item.areaName}：` : ""}${item.point}${item.quote ? `（他说：「${item.quote}」）` : ""}`, status: null, at: item.at, score: questionSimilarity(query, `${item.areaName ?? ""} ${item.point}`) })),
    ...memory.askedQuestions.map((item) => ({ kind: "question" as const, text: item.text, status: null, at: item.at, score: questionSimilarity(query, item.text) })),
  ];
  return candidates
    .filter((item) => item.score >= SEARCH_MIN)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

const HISTORY_LABELS: Record<ClaimHistory["status"], string> = { confirmed: "上次已验证", refuted: "上次没讲清", conflict: "上次说法不同" };

export function historyLabel(history: ClaimHistory): string {
  return `${HISTORY_LABELS[history.status]}${history.note ? `：${history.note}` : ""}`;
}

/** 写进系统提示词的一段；没有记忆为 null。 */
export function renderMemory(brief: InterviewBrief, memory: InterviewMemory): string | null {
  if (memory.sessions === 0) return null;
  const histories = claimHistory(brief.hypotheses, memory);
  const claimLines = histories.map((history) => {
    const hypothesis = brief.hypotheses.find((item) => item.id === history.hypothesisId)!;
    return `- 「${hypothesis.evidence.replace(/\s+/g, " ")}」：${historyLabel(history)}`;
  });
  // 上次失守的点：最近的在前，每个话题只留一条，最多四条——不然一个话题的三条短板会把别的话题挤掉。
  const seenAreas = new Set<string>();
  const weaknessLines = memory.weaknesses
    .filter((item) => (seenAreas.has(item.areaName ?? item.point) ? false : (seenAreas.add(item.areaName ?? item.point), true)))
    .slice(0, 4)
    .map((item) => `- ${item.areaName ? `${item.areaName}：` : ""}${item.point}`);
  return `上几场的记忆（同一位候选人，最近 ${memory.sessions} 场；可信）：
${claimLines.length > 0 ? `简历上的说法上次验过的：\n${claimLines.join("\n")}` : "简历上的说法上几场没验过。"}
${weaknessLines.length > 0 ? `上次失守的点（优先再验一次，看有没有补上）：\n${weaknessLines.join("\n")}` : ""}
用 lookup_memory 可以按关键词查上几场的说法、短板和问过的题。上次没讲清的优先再验；上次说法不同的当面问；问过的题换个角度。`;
}
