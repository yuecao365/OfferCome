import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";

import { renderProgress, type Progress } from "./progress";
import { event, type NewEvent, type TranscriptLine } from "./events";

/**
 * 评论员（interview-system-design.md §6.2，实验层）：每回合异步看最近几次交换，按"面试官该怎么做"的准则给至多一句判断，
 * 只写 critic_noted 事件（trace 与指标用），不进现场卡、不给候选人看、不改分数。
 */

export const CRITIC_PROMPT_VERSION = "critic-v1";
const CONTEXT_LINES = 8;
const LINE_MAX_CHARS = 400;

export const CRITIC_RULES = {
  stale_probe: "追问没贴着候选人上一句：候选人刚说的点没接，问了别的。",
  multi_ask: "一句多问：一句里两个以上要点或问号。",
  help_ignored: "候选人求助 / 要求具体时没有收窄题目，反而换了题或重复原话。",
  rambling_unchecked: "候选人明显跑题（讲到别的项目、社团、无关经历）没有被指出来拉回。",
  over_probed: "同一个点已经追了三轮以上还在追。",
} as const;
export type CriticRule = keyof typeof CRITIC_RULES;
const RULE_IDS = Object.keys(CRITIC_RULES) as [CriticRule, ...CriticRule[]];

export const criticOutputSchema = z.object({
  /** 违反了哪条准则；没违反为 null。 */
  rule: z.enum(RULE_IDS).nullable(),
  /** 给面试官的一句提醒（对下一句怎么改）；没违反为 null。 */
  note: z.string().max(120).nullable(),
});

const SYSTEM = `你是模拟面试的评论员，盯面试官的行为准则，不评候选人。输入是最近几句逐字稿，最后一句是面试官刚说的话（带编号）。只看这一句有没有违反下面的准则：
${Object.entries(CRITIC_RULES)
  .map(([id, text]) => `- ${id}：${text}`)
  .join("\n")}
没违反就 rule 与 note 都为 null（大多数回合应该是这样，不要硬挑毛病）。违反了就填 rule，note 写一句话告诉面试官下一句怎么改（不复述它说过的话，不超过 40 字，例如"上一句问了两个要点，这句只问一个"）。只输出 JSON。`;

/** 评面试官刚说的那句；产出事件（不落库）；没违反为 null。 */
export async function critique(input: { runId: string; config: AiTaskConfig; transcript: TranscriptLine[]; progress: Progress }): Promise<NewEvent<"critic_noted"> | null> {
  const last = [...input.transcript].reverse().find((line) => line.role === "interviewer");
  if (!last || last.kind === "closing" || last.kind === "fallback") return null;
  const recent = input.transcript.slice(-CONTEXT_LINES);
  const { output } = await runAgent({
    agent: "critic",
    runId: input.runId,
    config: input.config,
    feature: "AI 模拟面试",
    promptVersion: CRITIC_PROMPT_VERSION,
    system: SYSTEM,
    untrustedInputs: "逐字稿",
    payload: {
      progress: renderProgress(input.progress),
      transcript: recent.map((line) => `[${line.seq}] ${line.role === "interviewer" ? "面试官" : "候选人"}：${line.content.replace(/\s+/g, " ").slice(0, LINE_MAX_CHARS)}`),
      target: last.seq,
    },
    schema: criticOutputSchema,
    maxOutputTokens: 200,
    timeoutMs: 20_000,
  });
  if (!output.rule || !output.note?.trim()) return null;
  return event("critic_noted", { seq: last.seq, rule: output.rule, text: output.note.trim() }, input.runId);
}
