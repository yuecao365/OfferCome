import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import type { InterviewEvent, NewEvent, TranscriptLine } from "./events";
import { event } from "./events";

/**
 * 覆盖标注器（interview-system-design.md §6.4 之前的"标注器"）：面试中异步给每次交换打标签——碰了哪份材料、
 * 是什么言语行为。产物是 label_added 事件；汇总成"聊过什么"回填面试官的现场卡（不重复问），房间顶栏能显示进度。
 * 它不进关键路径：跑慢了就用上一次的，错了只影响一行提示。
 */

export const LABELER_PROMPT_VERSION = "labeler-v2";
/** 每几次交换（面试官说几句）跑一次。 */
export const LABEL_EVERY_EXCHANGES = 2;
const CONTEXT_LINES = 10;

export const SPEECH_ACTS = ["open", "probe", "clarify", "hint", "switch", "close"] as const;
export type SpeechAct = (typeof SPEECH_ACTS)[number];

export const labelerOutputSchema = z.object({
  labels: z
    .array(
      z.object({
        /** 面试官那句的编号。 */
        seq: z.number().int().nonnegative(),
        /** 碰了哪道材料（材料清单里的 id）；没有对应材料为 null。 */
        materialId: z.string().max(40).nullable(),
        /** open 开一个新话题 / probe 追问 / clarify 答疑或换个说法 / hint 给方向 / switch 换话题 / close 收尾。 */
        act: z.enum(SPEECH_ACTS),
      }),
    )
    .max(20),
});

/** 已经标过的最大编号；没有为 -1。 */
export function lastLabeledSeq(events: InterviewEvent[]): number {
  let last = -1;
  for (const item of events) if (item.type === "label_added" && item.payload.seq > last) last = item.payload.seq;
  return last;
}

/** 聊过的材料 id（按第一次出现的顺序）。 */
export function coveredMaterials(events: InterviewEvent[]): string[] {
  const seen: string[] = [];
  for (const item of events) {
    if (item.type === "label_added" && item.payload.materialId && !seen.includes(item.payload.materialId)) seen.push(item.payload.materialId);
  }
  return seen;
}

/** 该不该跑：还没标的面试官发言数到了节奏。 */
export function labelingDue(transcript: TranscriptLine[], events: InterviewEvent[]): boolean {
  const last = lastLabeledSeq(events);
  return transcript.filter((line) => line.role === "interviewer" && line.seq > last).length >= LABEL_EVERY_EXCHANGES;
}

const SYSTEM = `你是面试记录员。给面试官最近说的每一句打标签：碰了材料清单里的哪一道（按建议问法或名称对上就填 id，对不上填 null），以及这句是什么动作：open 开一个新话题、probe 在同一话题里追问、clarify 答疑或把题说具体、hint 给方向、switch 换到另一个话题、close 收尾。换到另一道材料（另一个项目、另一个面、另一道题）就是 switch，不是 probe；probe 只用于同一道材料的继续追问。只标 pending 里列出的编号，只输出 JSON。`;

/** 给还没标的面试官发言打标签；产出事件（不落库）。 */
export async function labelRecent(input: { runId: string; config: AiTaskConfig; brief: InterviewBrief; transcript: TranscriptLine[]; events: InterviewEvent[] }): Promise<NewEvent[]> {
  const last = lastLabeledSeq(input.events);
  const pending = input.transcript.filter((line) => line.role === "interviewer" && line.seq > last).map((line) => line.seq);
  if (pending.length === 0) return [];
  const from = Math.max(0, input.transcript.findIndex((line) => line.seq === pending[0]) - CONTEXT_LINES);
  const { output } = await runAgent({
    agent: "labeler",
    runId: input.runId,
    config: input.config,
    feature: "AI 模拟面试",
    promptVersion: LABELER_PROMPT_VERSION,
    system: SYSTEM,
    untrustedInputs: "逐字稿",
    payload: {
      materials: input.brief.areas.map((area) => ({ id: area.id, kind: area.kind, name: area.name, question: area.entryQuestion.slice(0, 80) })),
      transcript: input.transcript.slice(from).map((line) => `[${line.seq}] ${line.role === "interviewer" ? "面试官" : "候选人"}：${line.content.replace(/\s+/g, " ").slice(0, 400)}`),
      pending,
    },
    schema: labelerOutputSchema,
    maxOutputTokens: 600,
    timeoutMs: 30_000,
  });
  const known = new Set(input.brief.areas.map((area) => area.id));
  const wanted = new Set(pending);
  return output.labels
    .filter((label) => wanted.has(label.seq))
    .map((label) => event("label_added", { seq: label.seq, materialId: label.materialId && known.has(label.materialId) ? label.materialId : null, competencyId: null, act: label.act }, input.runId));
}
