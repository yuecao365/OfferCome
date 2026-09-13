import { z } from "zod";

import { memoryPatchSchema } from "./memory";

/**
 * 面试官的动作。模型只在"问什么、往哪追"上有自由：open_thread / probe / close_thread /
 * close_interview 由模型提出（工具入参，严格模式）；ask_intro 与 hint 由代码触发，
 * 模型只负责把话说出来。`note` 是记忆更新，不算推进动作。
 */

export const PROBE_ANCHOR_MAX_CHARS = 60;

/** 关线程时面试官对这段的判断：有实质回答 / 只有关键词或空话 / 一句没答上。 */
export const THREAD_VERDICTS = ["answered", "thin", "failed"] as const;
export type ThreadVerdict = (typeof THREAD_VERDICTS)[number];
export const THREAD_VERDICT_LABELS: Record<ThreadVerdict, string> = {
  answered: "有实质回答",
  thin: "只有关键词",
  failed: "没答上",
};

/** 库里 / 载荷里的 verdict 字符串 → 枚举；不认识的当没有。 */
export function parseThreadVerdict(value: unknown): ThreadVerdict | null {
  return typeof value === "string" && (THREAD_VERDICTS as readonly string[]).includes(value) ? (value as ThreadVerdict) : null;
}

/** 追问前面试官对候选人上一条回答的判断：实质回答，还是只有关键词 / 空话。 */
export const ANSWER_QUALITIES = ["substantive", "thin"] as const;
export type AnswerQuality = (typeof ANSWER_QUALITIES)[number];

const SINGLE_QUESTION_RULE = "只问一个问题：一个问号，不要“A、B、C 分别怎么”这样并列几个子问题；要引场景就先铺一句场景，问的点只有一个。";

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
    /** 上一条回答是实质回答（substantive）还是只有关键词 / 空话（thin）：关键词回答只追一次。 */
    lastAnswer: z.enum(ANSWER_QUALITIES),
  }),
  hint: z.object({}),
  close_thread: z.object({
    /** 面试官对这一段的一句判断，进工作记忆与线程备注。 */
    note: z.string().min(1).max(300),
    /** 这段候选人答得怎么样：answered 有实质回答、thin 只有关键词或空话、failed 一句没答上。只有代码推进关线程时为 null。 */
    verdict: z.enum(THREAD_VERDICTS).nullable(),
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

/** 模型可以提出的推进动作（暴露成工具）。 */
export const MODEL_ACTIONS = ["open_thread", "probe", "close_thread", "close_interview"] as const satisfies readonly ActionName[];

export type ModelActionName = (typeof MODEL_ACTIONS)[number];

export function isModelAction(name: string): name is ModelActionName {
  return (MODEL_ACTIONS as readonly string[]).includes(name);
}

export type InterviewerAction = {
  [K in ActionName]: { name: K; input: ActionInputs[K] };
}[ActionName];

export const ACTION_DESCRIPTIONS: Record<ModelActionName | "note", string> = {
  open_thread:
    `开一道新题：areaId 是当前阶段可开的那些（项目的一个角度 / 题池里的基础题 / 场景题），question 是你要问的话。项目角度的问题可以按候选人前面说过的内容改写（他提到的模块、他自己的说法）；基础题与场景题可以改措辞，不改问的内容。一次只能有一个进行中的线程，若当前线程还没结束，先 close_thread。question ${SINGLE_QUESTION_RULE}`,
  probe:
    `顺着候选人刚才的回答往下追问，仍在当前这道题里。anchor 填候选人上一条回答里的原话片段（追问要从它出发），question 是追问本身，${SINGLE_QUESTION_RULE}lastAnswer 写你对上一条回答的判断：substantive 有实质内容，thin 只有关键词或空话（只追一次，让他展开）。不要复述评分标准或期望信号。`,
  close_thread:
    "这道题（项目的这个角度 / 基础题 / 场景题）到此为止（答得充分、或已失守、或阶段时间到了）：note 写你对这段的判断——答到哪一层、哪句答得好、哪里失守；verdict 必须写候选人答得怎么样（answered 有实质回答 / thin 只有关键词或空话 / failed 一句没答上）。之后的回合里这段只剩这句 note，对话原文不再保留。同一回合紧接着 open_thread 或 close_interview。",
  close_interview: "各阶段都走完、或候选人明显无法继续时收尾。",
  note: "更新你的工作记忆：本回合新确认的、存疑的、失守的要点，以及简历假设的验证状态。可与一个推进动作同时使用。",
};

const QUESTION_MARKS = /[？?]/g;
const PARALLEL_SUBQUESTIONS = /分别/;

/** 一次只问一个问题：两个以上问号，或"分别"并列子问题，算复合问题；软门，工具层拒一次。 */
export function compoundQuestionReason(question: string): string | null {
  const marks = question.match(QUESTION_MARKS)?.length ?? 0;
  if (marks <= 1 && !PARALLEL_SUBQUESTIONS.test(question)) return null;
  return "一次只问一个问题：把最想问的那个留下，其余的等候选人答完再追";
}

/**
 * 候选人插话的意图，全部由代码判定并执行：
 * skip 跳过、repeat 再说一遍、end 结束、hint 卡住（不会 / 不懂 / 要提示 / 想考什么）、
 * deny 否定简历内容（"瞎写的""没做过"）。
 */
export type CandidateIntent = "skip" | "repeat" | "end" | "hint" | "deny" | null;

/** 房间里有按钮的意图；候选人只点按钮没打字时，落库与展示用的替代文本。 */
export type ButtonIntent = Extract<CandidateIntent, "skip" | "repeat" | "end" | "hint">;

export const CANDIDATE_INTENT_PLACEHOLDERS: Record<ButtonIntent, string> = {
  skip: "这题跳过。",
  repeat: "能再说一遍吗？",
  end: "我们结束吧。",
  hint: "这题我不太会。",
};

const INTENT_PATTERNS: Array<[NonNullable<CandidateIntent>, RegExp]> = [
  ["end", /(结束|到此为止|不想继续|先到这|今天就到这|别问了|不想答|不想回答|不面了|算了吧|end the interview)/i],
  ["deny", /(瞎写|乱写|没做过|没有做过|不是我做的|不是我写的|没参与|是编的|写错了|简历.*不(对|准确|属实))/],
  ["skip", /(跳过|下一题|换一题|换个问题|pass|skip)/i],
  ["repeat", /(再说一遍|重复一下|没听清|没看清|repeat)/i],
  ["hint", /(提示|hint|给点方向|提醒|不会|不太懂|不懂|没听懂|没看懂|不清楚|不知道|什么意思|能解释一下|想考什么|啥意思)/i],
];

const INTENT_MAX_CHARS = 40;

/** 只识别很短的插话，避免把一段正常回答里的"跳过"两个字当成意图。 */
export function detectCandidateIntent(text: string): CandidateIntent {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > INTENT_MAX_CHARS) return null;
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(trimmed)) return intent;
  }
  return null;
}
