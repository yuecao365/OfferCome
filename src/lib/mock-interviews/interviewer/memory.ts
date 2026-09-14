import { z } from "zod";

import { coverage, questionSimilarity } from "@/lib/text/similarity";

import type { InterviewBrief } from "./brief";

/**
 * 面试官的工作记忆。每回合由模型增量更新，代码持久化并设上限。
 * 作用：让追问有依据、让评价有据可查、替代远处的对话原文控制上下文。
 *
 * 模型常把同一件事换个措辞再写一遍（"目标是和真实行为分布做对比 / 对比"），所以入库时按相似度合并：
 * 同一列表里相似的合成一条（留更长的那句），写进"已确认 / 失守"的条目把"存疑"里相似的那条去掉（疑点有结论了）。
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
/** 两条算同一件事：3 元字符组的 Dice 到这个值，或短的那句被长的覆盖到这个比例。阈值按真实会话里的重复条目定（memory.test.ts）。 */
const SAME_ENTRY_DICE = 0.45;
const SAME_ENTRY_COVERAGE = 0.85;

export function sameEntry(left: string, right: string): boolean {
  if (left === right) return true;
  if (questionSimilarity(left, right) >= SAME_ENTRY_DICE) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return coverage(long, short) >= SAME_ENTRY_COVERAGE;
}

/** 把条目并进列表：与已有条目相似的合成一条（留更长的那句，回合号取新的），其余追加；超上限丢最旧的。 */
function mergeEntries(current: MemoryEntry[], incoming: MemoryEntry[]): MemoryEntry[] {
  const next = [...current];
  for (const entry of incoming) {
    const text = entry.text.trim();
    if (!text) continue;
    const index = next.findIndex((item) => sameEntry(item.text, text));
    if (index < 0) {
      next.push({ ...entry, text });
      continue;
    }
    const kept = next[index];
    next[index] = { areaId: kept.areaId ?? entry.areaId, text: text.length > kept.text.length ? text : kept.text, turn: Math.max(kept.turn, entry.turn) };
  }
  return next.slice(-MAX_ENTRIES_PER_LIST);
}

/** 存疑里与"有结论的条目"相似的去掉。 */
function withoutResolved(doubtful: MemoryEntry[], resolved: MemoryEntry[]): MemoryEntry[] {
  return doubtful.filter((doubt) => !resolved.some((entry) => sameEntry(entry.text, doubt.text)));
}

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
    // 旧会话按逐字去重存的，读出来时过一遍同样的合并，报告页立刻干净。
    const list = (entries: unknown) => mergeEntries([], Array.isArray(entries) ? (entries as MemoryEntry[]) : []);
    return {
      established: list(value.established),
      doubtful: list(value.doubtful),
      failed: list(value.failed),
      hypotheses: Array.isArray(value.hypotheses) && value.hypotheses.length > 0
        ? value.hypotheses
        : base.hypotheses,
    };
  } catch {
    return base;
  }
}

export function applyMemoryPatch(
  memory: InterviewMemory,
  patch: MemoryPatch,
  input: { turn: number; areaId: string | null },
): InterviewMemory {
  const known = new Set(memory.hypotheses.map((item) => item.id));
  const entries = (texts: string[]): MemoryEntry[] => texts.map((text) => ({ areaId: input.areaId, text, turn: input.turn }));
  const established = entries(patch.established);
  const failed = entries(patch.failed);
  return {
    established: mergeEntries(memory.established, established),
    doubtful: mergeEntries(withoutResolved(memory.doubtful, [...established, ...failed]), entries(patch.doubtful)),
    failed: mergeEntries(memory.failed, failed),
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
