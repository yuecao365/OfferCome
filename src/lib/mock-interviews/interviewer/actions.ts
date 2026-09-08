import { z } from "zod";

import { memoryPatchSchema } from "./memory";

/**
 * 面试官可用的动作（模型侧工具入参）。全部严格模式：字段必填、可空用 nullable。
 * `note` 是记忆更新，不算推进动作；其余每回合至多一个（close_thread 之后可紧接一个）。
 */

export const PROBE_ANCHOR_MAX_CHARS = 60;

export const actionSchemas = {
  ask_intro: z.object({}),
  open_thread: z.object({
    areaId: z.string().min(1).max(40),
    question: z.string().min(1).max(600),
  }),
  probe: z.object({
    /** 候选人上一条回答里的原话片段：追问必须锚在它上面。 */
    anchor: z.string().min(1).max(PROBE_ANCHOR_MAX_CHARS),
    question: z.string().min(1).max(600),
  }),
  rescue: z.object({
    hint: z.string().min(1).max(400),
  }),
  clarify: z.object({
    /** 回答候选人对题目本身的疑问，不降难度。 */
    reply: z.string().min(1).max(300),
  }),
  interrupt: z.object({
    reason: z.string().min(1).max(200),
    question: z.string().min(1).max(600),
  }),
  close_thread: z.object({
    /** 面试官对这一段的一句判断，进工作记忆与线程备注。 */
    note: z.string().min(1).max(300),
  }),
  close_interview: z.object({
    reason: z.string().min(1).max(200),
  }),
  note: memoryPatchSchema,
} as const;

export type ActionInputs = {
  [K in keyof typeof actionSchemas]: z.infer<(typeof actionSchemas)[K]>;
};

export type ActionName = Exclude<keyof typeof actionSchemas, "note">;

export const ACTION_NAMES: ActionName[] = [
  "ask_intro",
  "open_thread",
  "probe",
  "rescue",
  "clarify",
  "interrupt",
  "close_thread",
  "close_interview",
];

export function isActionName(name: string): name is ActionName {
  return (ACTION_NAMES as string[]).includes(name);
}

export type InterviewerAction = {
  [K in ActionName]: { name: K; input: ActionInputs[K] };
}[ActionName];

export const ACTION_DESCRIPTIONS: Record<keyof typeof actionSchemas, string> = {
  ask_intro: "开场时请候选人做一到两分钟的自我介绍。只能用一次。",
  open_thread:
    "切入一个新的考察领域：给出 areaId 和你要问的切入问题。一次只能有一个进行中的线程；若当前线程还没结束，先 close_thread。",
  probe:
    "顺着候选人刚才的回答往下追问，必须仍在当前线程的领域内。anchor 填候选人上一条回答里的原话片段（追问要从它出发），question 是追问本身；不要复述评分标准或期望信号。",
  rescue: "候选人明显卡住时给一次台阶：一个不泄露答案的提示或更具体的场景。每个线程只能用一次。",
  clarify:
    "候选人问的是题目本身（什么意思、想考什么、范围多大）时，直接解释清楚，不降难度、不给答案。不消耗提示次数，每线程最多两次。",
  interrupt:
    "候选人的回答明显跑题或过长时先打断，说明为什么，再把问题收窄成一句。每线程最多一次。",
  close_thread:
    "这一段问够了（答得充分、或已失守、或信息够了）：给一句你对这段的判断。可以在同一回合紧接着 open_thread 或 close_interview。",
  close_interview: "信息够了、所有领域都考察过、或候选人明显无法继续时收尾。",
  note: "更新你的工作记忆：本回合新确认的、存疑的、失守的要点，以及简历假设的验证状态。可与一个推进动作同时使用。",
};

/**
 * 候选人插话的意图。硬意图由代码直接执行（跳过 / 再说一遍 / 结束）；
 * 软意图（要提示 / 求澄清）只作为信号进提示词，由面试官判断该澄清还是给台阶。
 */
export type CandidateIntent = "skip" | "repeat" | "end" | "hint" | "clarify" | null;
export type HardIntent = Extract<CandidateIntent, "skip" | "repeat" | "end">;

export function isHardIntent(intent: CandidateIntent): intent is HardIntent {
  return intent === "skip" || intent === "repeat" || intent === "end";
}

/** 候选人只点了意图按钮、没打字时，落库与展示用的替代文本。 */
export const CANDIDATE_INTENT_PLACEHOLDERS: Record<NonNullable<CandidateIntent>, string> = {
  skip: "这题跳过。",
  repeat: "能再说一遍吗？",
  end: "我们结束吧。",
  hint: "能给点提示吗？",
  clarify: "这题是想考什么？",
};

export const CANDIDATE_INTENT_SIGNALS: Record<NonNullable<CandidateIntent>, string> = {
  skip: "候选人要求跳过",
  repeat: "候选人要求重复",
  end: "候选人要求结束",
  hint: "候选人可能在求提示：卡住了就用 rescue 给台阶，只是没听懂题就用 clarify",
  clarify: "候选人可能在求澄清：用 clarify 解释题目本身，不要降难度",
};

const INTENT_PATTERNS: Array<[NonNullable<CandidateIntent>, RegExp]> = [
  ["end", /(结束|到此为止|不想继续|先到这|今天就到这|end the interview)/i],
  ["skip", /(跳过|下一题|换一题|换个问题|这题不会|pass|skip)/i],
  ["repeat", /(再说一遍|重复一下|没听清|没看清|repeat)/i],
  ["hint", /(提示|hint|给点方向|能不能提醒|有没有提示)/i],
  ["clarify", /(不太懂|没听懂|没看懂|什么意思|能解释一下|想考什么|是指|具体指|啥意思)/i],
];

/** 只识别很短的插话，避免把一段正常回答里的"跳过"两个字当成意图。 */
export function detectCandidateIntent(text: string): CandidateIntent {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return null;
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(trimmed)) return intent;
  }
  return null;
}
