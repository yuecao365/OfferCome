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
 *
 * judge-v2：阶梯每层有锚定例子；"答到这一层"要引用候选人原话，引用不出来降一层；含糊话最多算第 2 层；分数落在层的分段里。
 */

export const JUDGE_PROMPT_VERSION = "judge-v2";
const LINE_MAX_CHARS = 600;
const BOUNDARY_ACTS = new Set(["open", "switch", "close"]);
/** 每层的分数段：分数与层次一致，不让第 1 层的回答拿 80 分。 */
export const SCORE_BANDS: Record<number, [number, number]> = { 1: [0, 45], 2: [45, 70], 3: [70, 85], 4: [85, 100] };
/** 含糊话：出现在引用里说明候选人没把机制说实，最多算第 2 层。 */
const HEDGE_PATTERN = /(应该是|大概|可能是|记不太清|记不清|不太确定|好像是|差不多)/;
const QUOTE_MIN_CHARS = 6;

export const judgeOutputSchema = z.object({
  /** 这段主要考的能力（能力清单里的 id）。 */
  competencyId: z.string().min(1).max(40),
  /** 答到阶梯第几层：1 只到概念 / 名词，2 说清机制，3 讲到取舍与边界，4 有自己的判断并能验证。 */
  difficulty: z.number().int().min(1).max(DIFFICULTY_LEVELS),
  /** 证明"答到这一层"的候选人原话，逐字复制一句。 */
  evidence: z.string().min(1).max(300),
  score: z.number().min(0).max(100),
  /** 对这次测量的把握：段短、答非所问、只有求助时低。 */
  confidence: z.number().min(0).max(1),
  note: z.string().min(1).max(200),
});
export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

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

export type Judgement = { competencyId: string; difficulty: number; score: number; confidence: number; note: string };

const normalize = (text: string) => text.replace(/\s+/g, "");

/**
 * 模型的判断 → 可用的判断（纯函数）：引用不在候选人的话里就降一层、把握打七折；引用里有含糊话最多第 2 层；
 * 分数夹进该层的分数段；能力 id 只认清单里的（对不上取材料的第一个）。
 */
export function repairJudgement(output: JudgeOutput, answers: string[], competencies: Competency[], fallbackCompetencyId: string | null): Judgement | null {
  const competencyId = competencies.some((item) => item.id === output.competencyId) ? output.competencyId : fallbackCompetencyId;
  if (!competencyId) return null;
  const said = normalize(answers.join("\n"));
  const quote = normalize(output.evidence);
  const quoted = quote.length >= QUOTE_MIN_CHARS && said.includes(quote);
  let difficulty = output.difficulty;
  let confidence = output.confidence;
  if (!quoted) {
    difficulty = Math.max(1, difficulty - 1);
    confidence *= 0.7;
  }
  if (HEDGE_PATTERN.test(output.evidence)) difficulty = Math.min(difficulty, 2);
  const [low, high] = SCORE_BANDS[difficulty];
  const score = Math.min(high, Math.max(low, output.score));
  return { competencyId, difficulty, score, confidence: Math.round(confidence * 100) / 100, note: output.note.trim() };
}

const SYSTEM = `你是面试的在线评委。输入是一场模拟面试里一段问答的逐字稿（这段第一问到下一个话题之前）、这段碰到的材料（可能没有）和岗位的能力清单。判断：
- competencyId：这段主要考的能力，只能填能力清单里的 id（材料若带能力提示优先用它）。
- difficulty：候选人实际答到阶梯第几层（不是题问到的层）。锚定例子：
  1 只到概念或名词——"我们用 trace_id 串起来的"，说不出怎么串、为什么。
  2 说清了机制——"每个 step 带 parent_step_id，回放时按它拼成树"，能说出怎么做，但没有取舍。
  3 讲到了取舍与边界——"没有全量存 payload，因为……所以只留摘要，代价是……"，说得出为什么不选另一种、什么情况会失效。
  4 有自己的判断并说得出怎么验证——"我会先按版本切一刀看 P95，如果只有新版本抬升就……"，有决策、有验证方法。
  只说"应该是""大概""记不太清"的，最多第 2 层；说错关键点的第 1 层。
- evidence：逐字复制候选人的一句原话，作为"答到这一层"的证据；引用不出来就降一层。
- score：分数与层次一致——第 1 层 0–45，第 2 层 45–70，第 3 层 70–85，第 4 层 85–100；层内按完整与准确定。只看候选人说了什么。
- confidence：这次测量的把握，0–1；段很短、答非所问、只有求助或跳过时给低（≤ 0.3）。
- note：一句话说明。
只输出 JSON。`;

/** 给一段打分；产出事件（不落库）。 */
export async function judgeSegment(input: { runId: string; config: AiTaskConfig; brief: InterviewBrief; competencies: Competency[]; transcript: TranscriptLine[]; segment: OnlineSegment }): Promise<NewEvent<"segment_scored"> | null> {
  const { segment } = input;
  const lines = input.transcript.filter((line) => line.seq >= segment.startSeq && line.seq <= segment.endSeq);
  const answers = lines.filter((line) => line.role === "candidate").map((line) => line.content);
  if (input.competencies.length === 0 || answers.length === 0) return null;
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
    maxOutputTokens: 500,
    timeoutMs: 30_000,
  });
  const judgement = repairJudgement(output, answers, input.competencies, area?.competencyIds[0] ?? null);
  if (!judgement) return null;
  return event("segment_scored", { startSeq: segment.startSeq, endSeq: segment.endSeq, ...judgement }, input.runId);
}
