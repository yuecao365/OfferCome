import type { Prior } from "./estimator";

/**
 * 跨场记忆的代码侧（interview-system-design.md §8 第三层）：上几场的事后能力估计折成这场估计器的先验。
 * 说法验证、短板、问过的角度这些给 agent 读的内容自 G4 起在候选人档案里（dossier-doc.ts / dossier.ts），不再存结构化记忆。
 * 记忆本身是对已有产物的读时物化，见 memory-recall.ts；这里是纯函数：时间衰减、先验。
 */

export type MemoryCompetency = { competencyId: string; mean: number; confidence: number; samples: number; at: string };

export type InterviewMemory = {
  /** 记忆来自几场。 */
  sessions: number;
  competencies: MemoryCompetency[];
};

export const EMPTY_MEMORY: InterviewMemory = { sessions: 0, competencies: [] };

export const HALF_LIFE_DAYS = 30;
/** 每场每项能力最多折成这么多伪计数：上几场再确定也不该压过这场的测量。 */
const MAX_PRIOR_PER_SESSION = 3;

/** 会话快照里的记忆；没有为空。 */
export function memoryOf(contextSnapshotJson: string | null | undefined): InterviewMemory {
  try {
    const parsed = JSON.parse(contextSnapshotJson ?? "{}") as { memory?: Partial<InterviewMemory> | null };
    const memory = parsed.memory;
    if (!memory || typeof memory !== "object") return EMPTY_MEMORY;
    return {
      sessions: typeof memory.sessions === "number" ? memory.sessions : 0,
      competencies: Array.isArray(memory.competencies) ? memory.competencies : [],
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
