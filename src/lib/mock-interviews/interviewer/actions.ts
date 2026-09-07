import { z } from "zod";

import { memoryPatchSchema } from "./memory";

/**
 * 面试官可用的动作（模型侧工具入参）。全部严格模式：字段必填、可空用 nullable。
 * `note` 是记忆更新，不算推进动作；其余每回合至多一个。
 */

export const actionSchemas = {
  ask_intro: z.object({}),
  open_thread: z.object({
    areaId: z.string().min(1).max(40),
    question: z.string().min(1).max(600),
  }),
  probe: z.object({
    question: z.string().min(1).max(600),
  }),
  rescue: z.object({
    hint: z.string().min(1).max(400),
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

export type InterviewerAction =
  | { name: "ask_intro"; input: ActionInputs["ask_intro"] }
  | { name: "open_thread"; input: ActionInputs["open_thread"] }
  | { name: "probe"; input: ActionInputs["probe"] }
  | { name: "rescue"; input: ActionInputs["rescue"] }
  | { name: "close_thread"; input: ActionInputs["close_thread"] }
  | { name: "close_interview"; input: ActionInputs["close_interview"] };

export const ACTION_DESCRIPTIONS: Record<keyof typeof actionSchemas, string> = {
  ask_intro: "开场时请候选人做一到两分钟的自我介绍。只能用一次。",
  open_thread:
    "切入一个新的考察领域：给出 areaId 和你要问的切入问题。一次只能有一个进行中的线程；若当前线程还没结束，先 close_thread。",
  probe:
    "顺着候选人刚才的回答往下追问，必须仍在当前线程的领域内，按深度阶梯往下走一级；不要复述评分标准或期望信号。",
  rescue: "候选人明显卡住时给一次台阶：一个不泄露答案的提示或更具体的场景。每个线程只能用一次。",
  close_thread:
    "这一段问够了（答得充分、或已失守、或时间用尽）：给一句你对这段的判断。之后再决定 open_thread 或 close_interview。",
  close_interview: "所有领域都考察过或时间用尽时收尾。",
  note: "更新你的工作记忆：本回合新确认的、存疑的、失守的要点，以及简历假设的验证状态。可与一个推进动作同时使用。",
};

/** 由候选人插话触发、由代码识别的意图。 */
export type CandidateIntent = "skip" | "hint" | "repeat" | "end" | null;

/** 候选人只点了意图按钮、没打字时，落库与展示用的替代文本。 */
export const CANDIDATE_INTENT_PLACEHOLDERS: Record<NonNullable<CandidateIntent>, string> = {
  skip: "这题跳过。",
  hint: "能给点提示吗？",
  repeat: "能再说一遍吗？",
  end: "我们结束吧。",
};

const INTENT_PATTERNS: Array<[CandidateIntent, RegExp]> = [
  ["end", /(结束|到此为止|不想继续|先到这|今天就到这|end the interview)/i],
  ["skip", /(跳过|下一题|换一题|换个问题|这题不会|pass|skip)/i],
  ["hint", /(提示|hint|给点方向|能不能提醒|有没有提示)/i],
  ["repeat", /(再说一遍|重复一下|没听清|没看清|repeat)/i],
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
