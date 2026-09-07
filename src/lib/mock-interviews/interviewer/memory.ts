import { z } from "zod";

import type { InterviewBrief } from "./brief";

/**
 * 面试官的工作记忆。每回合由模型增量更新，代码持久化并设上限。
 * 作用：让追问有依据、让评价有据可查、替代远处的对话原文控制上下文。
 */

export type MemoryEntry = { areaId: string | null; text: string; turn: number };
export type HypothesisStatus = "open" | "confirmed" | "refuted";

export type InterviewMemory = {
  established: MemoryEntry[];
  doubtful: MemoryEntry[];
  failed: MemoryEntry[];
  hypotheses: { id: string; status: HypothesisStatus; note: string | null }[];
};

/** 模型侧的记忆更新（note 工具入参）：严格模式，数组必填可空。 */
export const memoryPatchSchema = z.object({
  established: z.array(z.string().min(1).max(200)).max(5),
  doubtful: z.array(z.string().min(1).max(200)).max(5),
  failed: z.array(z.string().min(1).max(200)).max(5),
  hypotheses: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        status: z.enum(["open", "confirmed", "refuted"]),
        note: z.string().max(200).nullable(),
      }),
    )
    .max(6),
});
export type MemoryPatch = z.infer<typeof memoryPatchSchema>;

const MAX_ENTRIES_PER_LIST = 20;

export function emptyMemory(brief: InterviewBrief): InterviewMemory {
  return {
    established: [],
    doubtful: [],
    failed: [],
    hypotheses: brief.hypotheses.map((item) => ({ id: item.id, status: "open", note: null })),
  };
}

export function parseStoredMemory(json: string | null, brief: InterviewBrief): InterviewMemory {
  const base = emptyMemory(brief);
  if (!json) return base;
  try {
    const value = JSON.parse(json) as Partial<InterviewMemory>;
    return {
      established: Array.isArray(value.established) ? value.established : [],
      doubtful: Array.isArray(value.doubtful) ? value.doubtful : [],
      failed: Array.isArray(value.failed) ? value.failed : [],
      hypotheses: Array.isArray(value.hypotheses) && value.hypotheses.length > 0
        ? value.hypotheses
        : base.hypotheses,
    };
  } catch {
    return base;
  }
}

function appendEntries(
  current: MemoryEntry[],
  texts: string[],
  areaId: string | null,
  turn: number,
): MemoryEntry[] {
  const next = [...current];
  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed || next.some((item) => item.text === trimmed)) continue;
    next.push({ areaId, text: trimmed, turn });
  }
  return next.slice(-MAX_ENTRIES_PER_LIST);
}

export function applyMemoryPatch(
  memory: InterviewMemory,
  patch: MemoryPatch,
  input: { turn: number; areaId: string | null },
): InterviewMemory {
  const known = new Set(memory.hypotheses.map((item) => item.id));
  return {
    established: appendEntries(memory.established, patch.established, input.areaId, input.turn),
    doubtful: appendEntries(memory.doubtful, patch.doubtful, input.areaId, input.turn),
    failed: appendEntries(memory.failed, patch.failed, input.areaId, input.turn),
    hypotheses: memory.hypotheses.map((item) => {
      const update = patch.hypotheses.find((entry) => entry.id === item.id && known.has(entry.id));
      return update ? { id: item.id, status: update.status, note: update.note } : item;
    }),
  };
}

/** 给提示词看的记忆摘要。 */
export function renderMemory(memory: InterviewMemory, brief: InterviewBrief): string {
  const hypothesisText = new Map(brief.hypotheses.map((item) => [item.id, item.text]));
  const lines: string[] = [];
  const list = (title: string, entries: MemoryEntry[]) => {
    if (entries.length === 0) return;
    lines.push(`${title}：`);
    for (const entry of entries.slice(-8)) lines.push(`- ${entry.text}`);
  };
  list("已确认", memory.established);
  list("存疑，待验证", memory.doubtful);
  list("失守之处", memory.failed);
  const open = memory.hypotheses.filter((item) => item.status === "open");
  if (open.length > 0) {
    lines.push("尚未验证的简历假设：");
    for (const item of open) lines.push(`- [${item.id}] ${hypothesisText.get(item.id) ?? ""}`);
  }
  return lines.length > 0 ? lines.join("\n") : "（暂无）";
}
