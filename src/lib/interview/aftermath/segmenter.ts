import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { AREA_KINDS, type AreaKind, type InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { THREAD_VERDICTS, type ThreadVerdict } from "@/lib/mock-interviews/verdicts";

import { DIFFICULTY_LEVELS, type Competency } from "../estimator";
import type { TranscriptLine } from "../events";

/**
 * 整理员（interview-system-design.md §5 事后流水线的第一步）：面试结束后从逐字稿切出话题段。
 * 一段 = 面试官进入一个话题的那句提问，到下一段开始之前；同一材料的连续追问属于同一段，候选人的
 * 澄清与求助不开新段。每段带对应材料、种类、一句标签、判断（verdict）与一句判断。
 *
 * 幂等、可重跑：输入完整（逐字稿 + 材料清单），错了重跑一次就好，面试本身不受影响。
 */

export const SEGMENTER_PROMPT_VERSION = "segmenter-v4";
const MAX_SEGMENTS = 30;
const LINE_MAX_CHARS = 700;

export const segmenterOutputSchema = z.object({
  segments: z
    .array(
      z.object({
        /** 这段第一问在逐字稿里的编号（面试官那句）。 */
        startSeq: z.number().int().nonnegative(),
        /** 对应材料清单里的 id；临场话题填 null。 */
        areaId: z.string().max(40).nullable(),
        kind: z.enum(AREA_KINDS),
        label: z.string().min(1).max(60),
        verdict: z.enum(THREAD_VERDICTS),
        /** 一句判断：答到哪一层、哪里好、哪里失守。 */
        note: z.string().min(1).max(300),
        /** 这段主要考的能力（能力清单里的 id）；对不上为 null。 */
        competencyId: z.string().max(40).nullable(),
        /** 候选人答到阶梯第几层：1 只到概念，2 说清机制，3 讲到取舍与边界，4 有自己的判断并能验证。 */
        difficulty: z.number().int().min(1).max(DIFFICULTY_LEVELS),
      }),
    )
    .max(MAX_SEGMENTS),
  /** 简历假设的验证结果：这场碰到了就 confirmed / refuted，没碰到 open。 */
  hypotheses: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        status: z.enum(["open", "confirmed", "refuted"]),
        /** 一句结论：confirmed 说哪段话证实了它；refuted 说差在哪；open 为 null。 */
        note: z.string().max(200).nullable(),
      }),
    )
    .max(10),
});
export type SegmenterOutput = z.infer<typeof segmenterOutputSchema>;
export type HypothesisJudgement = SegmenterOutput["hypotheses"][number];

/** 只认简报里有的假设；没提到的按 open 补齐。 */
export function repairHypotheses(output: SegmenterOutput, brief: InterviewBrief): HypothesisJudgement[] {
  const judged = new Map(output.hypotheses.map((item) => [item.id, item]));
  return brief.hypotheses.map((hypothesis) => {
    const item = judged.get(hypothesis.id);
    return item && item.status !== "open" ? { id: hypothesis.id, status: item.status, note: item.note?.trim() || null } : { id: hypothesis.id, status: "open" as const, note: null };
  });
}

export type Segment = {
  startSeq: number;
  endSeq: number;
  areaId: string | null;
  kind: AreaKind;
  label: string;
  verdict: ThreadVerdict;
  note: string;
  /** 这段的第一问。 */
  entryQuestion: string;
  /** 第一问之后又问了几轮。 */
  depth: number;
  /** 候选人在这段里说的话（按顺序）。 */
  answers: string[];
  competencyId: string | null;
  difficulty: number;
};

/**
 * 模型产出 → 可用的分段（纯函数）：编号要是面试官那句（写成候选人那句的靠到前一句面试官）、开场那句不算（从开场起的段靠到第一问，除非第一问已有段）、去重排序、
 * 结束编号取下一段开始之前；areaId 只认材料里有的；没有候选人回答的段 verdict 强制 skipped。
 */
export function repairSegments(output: SegmenterOutput, transcript: TranscriptLine[], brief: InterviewBrief, competencies: Competency[] = []): Segment[] {
  const bySeq = new Map(transcript.map((line) => [line.seq, line]));
  const competencyIds = new Set(competencies.map((item) => item.id));
  const areas = new Map(brief.areas.map((area) => [area.id, area]));
  const starts = new Map<number, SegmenterOutput["segments"][number]>();
  const openingSeq = transcript[0]?.seq;
  const firstQuestionSeq = transcript.find((line) => line.role === "interviewer" && line.seq !== openingSeq)?.seq;
  // 模型偶尔把编号写成候选人那句的（整场都错一位，coverage-1 里一场因此一段都没剩）：靠到它前面那句面试官的话。
  const snapped = output.segments.map((item) => {
    const line = bySeq.get(item.startSeq);
    const startSeq = line?.role === "candidate" ? (transcript.findLast((prior) => prior.seq < item.startSeq && prior.role === "interviewer")?.seq ?? -1) : item.startSeq;
    return { item, startSeq };
  });
  for (const { item, startSeq } of snapped) {
    if (!bySeq.has(startSeq) || startSeq === openingSeq) continue;
    if (!starts.has(startSeq)) starts.set(startSeq, item);
  }
  // 从开场那句起的段（模型把自我介绍和第一个项目话题合成了一段）：没有别的段从第一问开始时，靠到第一问；否则丢掉。
  for (const { item, startSeq } of snapped) {
    if (startSeq === openingSeq && firstQuestionSeq !== undefined && !starts.has(firstQuestionSeq)) starts.set(firstQuestionSeq, item);
  }
  const ordered = [...starts.keys()].sort((left, right) => left - right);
  const lastSeq = transcript.at(-1)?.seq ?? 0;
  return ordered.map((startSeq, index) => {
    const raw = starts.get(startSeq)!;
    const endSeq = index + 1 < ordered.length ? ordered[index + 1] - 1 : lastSeq;
    const lines = transcript.filter((line) => line.seq >= startSeq && line.seq <= endSeq);
    const answers = lines.filter((line) => line.role === "candidate").map((line) => line.content);
    const area = raw.areaId ? (areas.get(raw.areaId) ?? null) : null;
    return {
      startSeq,
      endSeq,
      areaId: area?.id ?? null,
      kind: area?.kind ?? raw.kind,
      label: raw.label.trim() || area?.name || "临场话题",
      verdict: answers.length === 0 ? "skipped" : raw.verdict,
      note: raw.note.trim(),
      entryQuestion: bySeq.get(startSeq)!.content,
      depth: Math.max(0, lines.filter((line) => line.role === "interviewer").length - 1),
      answers,
      competencyId: raw.competencyId && competencyIds.has(raw.competencyId) ? raw.competencyId : (area?.competencyIds.find((id) => competencyIds.has(id)) ?? null),
      difficulty: raw.difficulty,
    };
  });
}

function renderTranscript(transcript: TranscriptLine[]): string[] {
  return transcript.map((line) => `[${line.seq}] ${line.role === "interviewer" ? "面试官" : "候选人"}：${line.content.replace(/\s+/g, " ").slice(0, LINE_MAX_CHARS)}`);
}

function renderMaterials(brief: InterviewBrief): { id: string; kind: AreaKind; name: string; question: string }[] {
  return brief.areas.map((area) => ({ id: area.id, kind: area.kind, name: area.name, question: area.entryQuestion.slice(0, 80) }));
}

const SYSTEM = `你是面试整理员。输入是一场模拟面试的逐字稿（每句带编号）、面试官手边的材料清单（每道材料有 id、种类、名称、建议问法）和岗位的能力清单。把逐字稿切成话题段：
- 一段从面试官进入一个话题的那句提问开始，到下一个话题开始之前结束；同一道材料的连续追问属于同一段；候选人的澄清、求助、跑题都不开新段；面试官换到另一道材料、另一个项目的面或临场话题时才开新段。
- 开场问候与候选人的自我介绍不算段；收尾告别不算段。
- hypotheses：材料清单里附了备课时从简历提出的假设（id、要验证什么、简历原句）。逐条判断这场有没有碰到：碰到并且候选人讲清了 → confirmed，note 写哪段话证实了；碰到但没讲清或与简历不符 → refuted，note 用"没有讲清楚""还需要更多证据"这类措辞说差在哪；没碰到 → open。
- 每段：startSeq 是这段第一问（面试官那句）的编号；areaId 是对应材料的 id（只填材料清单里的 id，不是假设的 id；顺着材料的建议问法或名称对上就填，临场话题填 null）；kind 是种类（project 项目 / quick 基础题 / scenario 场景题）；label 一句标签；verdict 是候选人这段答得怎么样：answered 有实质内容、thin 只有关键词没机制、failed 没答上或答错关键点、skipped 候选人要求跳过或没答；note 一句判断：答到哪一层、哪里好、哪里失守，写给评分与报告看；competencyId 是这段主要考的能力（只填能力清单里的 id，对不上填 null）；difficulty 是候选人实际答到阶梯第几层（1 只到概念或名词，2 说清了机制，3 讲到了取舍与边界，4 有自己的判断并说得出怎么验证）。
- 只输出 JSON。`;

/** 一次调用：逐字稿 + 材料 → 分段。 */
export async function segmentTranscript(input: { runId: string; config: AiTaskConfig; transcript: TranscriptLine[]; brief: InterviewBrief; competencies: Competency[] }): Promise<{ segments: Segment[]; hypotheses: HypothesisJudgement[] }> {
  const { output } = await runAgent({
    agent: "segmenter",
    runId: input.runId,
    config: input.config,
    feature: "AI 模拟面试",
    promptVersion: SEGMENTER_PROMPT_VERSION,
    system: SYSTEM,
    untrustedInputs: "逐字稿",
    payload: {
      transcript: renderTranscript(input.transcript),
      materials: renderMaterials(input.brief),
      hypotheses: input.brief.hypotheses.map((item) => ({ id: item.id, text: item.text, evidence: item.evidence })),
      competencies: input.competencies.map((item) => ({ id: item.id, name: item.name })),
    },
    schema: segmenterOutputSchema,
    maxOutputTokens: 3_500,
    timeoutMs: 60_000,
  });
  return { segments: repairSegments(output, input.transcript, input.brief, input.competencies), hypotheses: repairHypotheses(output, input.brief) };
}
