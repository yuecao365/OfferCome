import { z } from "zod";

import { AREA_KINDS } from "./brief";
import { memoryPatchSchema } from "./memory";

/**
 * 面试官的记账工具。面试官说什么、追不追、什么时候换话题由它自己定，工具只是让代码知道
 * "现在聊到哪了"：plan 写 / 改计划，enter / leave 进入 / 离开一个话题（切段与评分的边界），
 * note 更新工作记忆，end 收尾。没有一个工具会被代码拒绝；代码只守总回合预算与"结束"按钮。
 */

/** 离开一个话题时面试官对这段的判断。 */
export const THREAD_VERDICTS = ["answered", "thin", "failed", "skipped"] as const;
export type ThreadVerdict = (typeof THREAD_VERDICTS)[number];
export const THREAD_VERDICT_LABELS: Record<ThreadVerdict, string> = {
  answered: "有实质回答",
  thin: "只有关键词",
  failed: "没答上",
  skipped: "跳过",
};

/** 库里 / 载荷里的 verdict 字符串 → 枚举；不认识的当没有。 */
export function parseThreadVerdict(value: unknown): ThreadVerdict | null {
  return typeof value === "string" && (THREAD_VERDICTS as readonly string[]).includes(value) ? (value as ThreadVerdict) : null;
}

export const planItemSchema = z.object({
  /** 沿用上一版计划里的 id 表示同一项；新项随便起一个短 id。 */
  id: z.string().min(1).max(20),
  label: z.string().min(1).max(60),
  kind: z.enum(AREA_KINDS),
  /** 对应材料里的哪道题（areaId）；候选人自己带出来、材料里没有的为 null。 */
  areaId: z.string().min(1).max(40).nullable(),
  /** 打算花几个回合；不确定为 null。 */
  turns: z.number().int().min(1).max(40).nullable(),
});

export const toolSchemas = {
  plan: z.object({
    items: z.array(planItemSchema).min(1).max(20),
    /** 一句话：为什么这么排。 */
    note: z.string().max(200).nullable(),
  }),
  enter: z.object({
    /** 计划里的哪一项；临场进入计划外的话题为 null。 */
    itemId: z.string().min(1).max(20).nullable(),
    label: z.string().min(1).max(60),
    kind: z.enum(AREA_KINDS),
    areaId: z.string().min(1).max(40).nullable(),
  }),
  leave: z.object({
    verdict: z.enum(THREAD_VERDICTS),
    /** 对这段的一句判断：答到哪一层、哪里好、哪里失守。之后的回合里这段只剩这句话。 */
    note: z.string().min(1).max(300),
  }),
  note: memoryPatchSchema,
  end: z.object({
    reason: z.string().min(1).max(200),
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;
export type ToolInputs = { [K in ToolName]: z.infer<(typeof toolSchemas)[K]> };
export type PlanInput = ToolInputs["plan"];
export type EnterInput = ToolInputs["enter"];
export type LeaveInput = ToolInputs["leave"];

export const TOOL_NAMES = ["plan", "enter", "leave", "note", "end"] as const satisfies readonly ToolName[];

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  plan: "写或改你的面试计划：要聊哪些话题（项目的哪几面、几道基础题、场景题）、各打算花几个回合、按什么顺序。开场后第一回合必须写；之后想改随时改（整份重写，沿用没变的项的 id）。",
  enter: "进入一个话题：你这回合开始问一个新的话题时调用（itemId 指向计划里的项；候选人临场带出来、计划外的话题 itemId 为 null）。切段、评分以它为边界。上一个话题还没 leave 的话，系统替你按“没交代”离开。",
  leave: "离开当前话题：verdict 写候选人这段答得怎么样（answered 有实质回答 / thin 只有关键词或空话 / failed 没答上 / skipped 他要求跳过），note 写你的一句判断。之后的回合里这段只剩这句 note，对话原文不再保留。",
  note: "更新你的工作记忆：本回合新确认的、存疑的、失守的要点，以及简历假设的验证状态。",
  end: "收尾结束面试：预算用完、该聊的聊完，或候选人明显无法继续时调用；这回合说的话就是告别。",
};

/**
 * 候选人的插话里只有"结束"由代码执行（用户的操作必须生效，不经模型）。
 * 求助、跳过、再说一遍都是给面试官的话，由模型自己应对。
 */
export type CandidateIntent = "end" | null;

/** 房间里的按钮：候选人只点按钮没打字时发给面试官的话。 */
export type ButtonIntent = "skip" | "repeat" | "end" | "hint";

export const CANDIDATE_INTENT_PLACEHOLDERS: Record<ButtonIntent, string> = {
  skip: "这题我想跳过。",
  repeat: "能再说一遍吗？",
  end: "我们结束吧。",
  hint: "这题我不太会，能给个方向吗？",
};

const END_PATTERN = /(结束|到此为止|不想继续|先到这|今天就到这|别问了|不想答了|不面了|算了吧|end the interview)/i;
const INTENT_MAX_CHARS = 40;

/** 只识别很短的插话，避免把一段正常回答里的"结束"两个字当成意图。 */
export function detectCandidateIntent(text: string): CandidateIntent {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > INTENT_MAX_CHARS) return null;
  return END_PATTERN.test(trimmed) ? "end" : null;
}
