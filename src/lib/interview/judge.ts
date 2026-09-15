import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { DIFFICULTY_LEVELS, type Competency } from "./estimator";
import { event, type InterviewEvent, type NewEvent, type TranscriptLine } from "./events";

/**
 * 在线评委（interview-system-design.md §6.1 / §6.4）：面试中每段问答结束时打一次分——考的哪项能力、
 * 答到阶梯第几层、分数与把握。段从标注器的标签推（open / switch 开段，下一句 open / switch / close 之前结束）。
 * 产物是 segment_scored 事件，估计器据此更新；不进关键路径，跑慢了或错了只影响现场卡的一行。
 */

export const JUDGE_PROMPT_VERSION = "judge-v1";
const LINE_MAX_CHARS = 600;
const BOUNDARY_ACTS = new Set(["open", "switch", "close"]);

export const judgeOutputSchema = z.object({
  /** 这段主要考的能力（能力清单里的 id）。 */
  competencyId: z.string().min(1).max(40),
  /** 答到阶梯第几层：1 只到概念 / 名词，2 说清机制，3 讲到取舍与边界，4 有自己的判断并能验证。 */
  difficulty: z.number().int().min(1).max(DIFFICULTY_LEVELS),
  score: z.number().min(0).max(100),
  /** 对这次测量的把握：段短、答非所问、只有求助时低。 */
  confidence: z.number().min(0).max(1),
  note: z.string().min(1).max(200),
});

export type OnlineSegment = { startSeq: number; endSeq: number; materialId: string | null };

/**
 * 已结束、还没评分的段（从 label_added 推）：open / switch / close 是边界，碰到的材料换了也是边界
 * （标注器常把换材料标成 probe）；开场那句起的段（自我介绍）不算测量。
 */
export function closedSegments(events: InterviewEvent[], openingSeq: number | null = null): OnlineSegment[] {
  const labels = events.flatMap((item) => (item.type === "label_added" ? [item.payload] : [])).sort((left, right) => left.seq - right.seq);
  const scored = new Set(events.flatMap((item) => (item.type === "segment_scored" ? [item.payload.startSeq] : [])));
  let material: string | null = null;
  const boundaries = labels.filter((label) => {
    const changed = label.materialId !== null && material !== null && label.materialId !== material;
    if (label.materialId) material = label.materialId;
    return BOUNDARY_ACTS.has(label.act) || changed;
  });
  const segments: OnlineSegment[] = [];
  for (let index = 0; index + 1 < boundaries.length; index += 1) {
    const start = boundaries[index];
    if (start.act === "close" || start.seq === openingSeq || scored.has(start.seq)) continue;
    const inside = labels.filter((label) => label.seq >= start.seq && label.seq < boundaries[index + 1].seq);
    segments.push({ startSeq: start.seq, endSeq: boundaries[index + 1].seq - 1, materialId: inside.find((label) => label.materialId)?.materialId ?? null });
  }
  return segments;
}

const SYSTEM = `你是面试的在线评委。输入是一场模拟面试里一段问答的逐字稿（这段第一问到下一个话题之前）、这段碰到的材料（可能没有）和岗位的能力清单。判断：
- competencyId：这段主要考的能力，只能填能力清单里的 id（材料若带能力提示优先用它）。
- difficulty：候选人答到阶梯第几层——1 只到概念或名词，2 说清了机制，3 讲到了取舍与边界，4 有自己的判断并说得出怎么验证。按候选人实际答到的层，不是题问到的层。
- score：这段答得怎么样，0–100；只看候选人说了什么，引用不出来的不算。
- confidence：这次测量的把握，0–1；段很短、答非所问、只有求助或跳过时给低（≤ 0.3）。
- note：一句话说明。
只输出 JSON。`;

/** 给一段打分；产出事件（不落库）。 */
export async function judgeSegment(input: { runId: string; config: AiTaskConfig; brief: InterviewBrief; competencies: Competency[]; transcript: TranscriptLine[]; segment: OnlineSegment }): Promise<NewEvent<"segment_scored"> | null> {
  const { segment } = input;
  const lines = input.transcript.filter((line) => line.seq >= segment.startSeq && line.seq <= segment.endSeq);
  if (input.competencies.length === 0 || !lines.some((line) => line.role === "candidate")) return null;
  const area = segment.materialId ? (input.brief.areas.find((item) => item.id === segment.materialId) ?? null) : null;
  const { output } = await runAgent({
    agent: "judge",
    runId: input.runId,
    config: input.config,
    feature: "AI 模拟面试",
    promptVersion: JUDGE_PROMPT_VERSION,
    system: SYSTEM,
    untrustedInputs: "逐字稿",
    payload: {
      transcript: lines.map((line) => `[${line.seq}] ${line.role === "interviewer" ? "面试官" : "候选人"}：${line.content.replace(/\s+/g, " ").slice(0, LINE_MAX_CHARS)}`),
      material: area ? { name: area.name, kind: area.kind, guides: area.guides, competencyIds: area.competencyIds } : null,
      competencies: input.competencies.map((item) => ({ id: item.id, name: item.name, priority: item.priority })),
    },
    schema: judgeOutputSchema,
    maxOutputTokens: 400,
    timeoutMs: 30_000,
  });
  const competencyId = input.competencies.some((item) => item.id === output.competencyId) ? output.competencyId : (area?.competencyIds[0] ?? null);
  if (!competencyId) return null;
  return event("segment_scored", { startSeq: segment.startSeq, endSeq: segment.endSeq, competencyId, difficulty: output.difficulty, score: output.score, confidence: output.confidence, note: output.note.trim() }, input.runId);
}
