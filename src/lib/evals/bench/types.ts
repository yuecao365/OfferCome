/**
 * InterviewBench 端到端层的数据形状（eval/bench/README.md §2、§3、§5）。
 * bench 拥有任务、候选人与评分器；提交者只实现 Interviewer。这里不引用本项目面试流程的任何类型。
 */

export const BENCH_LEVELS = ["low", "medium", "high"] as const;
export type BenchLevel = (typeof BENCH_LEVELS)[number];

/** 评分卡的等级：与真值三档一对一，1 = low、2 = medium、3 = high（bench v2 起；v1 的 1–4 级有损压缩已废）。 */
export type ScorecardLevel = 1 | 2 | 3;
export const LEVEL_OF_RATING: Record<ScorecardLevel, BenchLevel> = { 1: "low", 2: "medium", 3: "high" };

/** 三档锚点：候选人模拟器、评分卡说明、评分器共用同一份文字，谁都不能自己另写一套。 */
export const LEVEL_ANCHORS: Record<BenchLevel, string> = {
  low: "只到名词：知道有这么个东西，说不出它怎么工作；追到机制就答不上，或说那部分是同事做的。",
  medium: "说清一层机制：能讲这个东西怎么工作、自己怎么用；但问到为什么这样选、边界在哪、怎么验证有效，就含糊。",
  high: "有取舍与验证：讲机制之外，能说出当时选 A 没选 B 的原因、代价或边界，给出具体数字或量级，并说得出怎么确认它有效。",
};

export const CANDIDATE_STYLES = ["solid", "shaky", "rambling", "needy", "adversarial"] as const;
export type CandidateStyle = (typeof CANDIDATE_STYLES)[number];

export const FACT_TYPES = ["wrong", "inflated", "hollow"] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const BEHAVIORS = ["humble_lead", "long_answers", "help_loop", "manipulate", "off_resume_intro"] as const;
export type Behavior = (typeof BEHAVIORS)[number];

export const PACES = ["quick", "standard", "deep"] as const;
export type Pace = (typeof PACES)[number];
export const MAX_TURNS: Record<Pace, number> = { quick: 10, standard: 16, deep: 24 };

export type Competency = { id: string; name: string; description: string; weight: 1 | 2 | 3 };

/** 埋点。`competencyId` 是它落在哪项能力上（任务构建时算好）：该能力的真值不能是 high，否则候选人一边按 high 答一边说错话，真值自相矛盾。 */
export type Fact =
  | { type: "wrong"; topic: string; competencyId: string | null; says: string; whyWrong: string }
  | { type: "inflated"; topic: string; competencyId: string | null; resume: string; says: string }
  | { type: "hollow"; topic: string; competencyId: string | null; resume: string };

export type Candidate = {
  style: CandidateStyle;
  seed: number;
  levels: Record<string, BenchLevel>;
  facts: Fact[];
  behavior: Behavior | null;
};

export type Task = {
  id: string;
  set: "dev" | "heldout";
  job: { title: string; company: string; description: string; source: string };
  resume: { text: string; source: string };
  competencies: Competency[];
  budget: { pace: Pace; maxTurns: number };
  candidate: Candidate;
};

/**
 * 面试规范：bench 公开给所有提交的同一段话（README §6.4 专业项的大白话版）。它是真实面试的常识，不是某个提交的秘方；
 * 提交者用不用它自己定（裸模型放进系统提示词；固定题本用不上；本仓库 harness 有自己的规范，不吃这段），榜上如实记。
 */
export const INTERVIEW_NORMS = "像真实面试官一样：先请候选人自我介绍；每次只说一段话，问题围绕一个点；顺着候选人的回答往下追，追到能判断这项能力到哪一层为止；核实简历上的数字和说法；候选人答不上就换；不透露评分标准；自己看着回合数，在用完前主动收尾告别。";

/** 面试官看到的任务：没有候选人档案；norms 是上面那段规范。 */
export type TaskForInterviewer = Pick<Task, "id" | "job" | "resume" | "competencies" | "budget"> & { norms: string };

export type ScorecardRating = { competencyId: string; level: ScorecardLevel; evidence: string };
export type RedFlag = { type: FactType; quote: string; note: string };
export const OVERALLS = ["strong_no_hire", "no_hire", "hire", "strong_hire"] as const;
export type Overall = (typeof OVERALLS)[number];
export type Scorecard = { ratings: ScorecardRating[]; redFlags: RedFlag[]; overall: Overall; summary: string };

/** 逐字稿一行。候选人行带 bench 侧才知道的标记（说了哪条埋点、这句是答不上还是在求澄清），提交者看不到。 */
export type TranscriptTurn =
  | { role: "interviewer"; index: number; text: string; end: boolean }
  | { role: "candidate"; index: number; text: string; couldNotAnswer: boolean; askedForClarification: boolean; factsSaid: number[] };

/** 提交者要实现的接口（README §2）。 */
export interface Interviewer {
  start(input: TaskForInterviewer): Promise<void>;
  /** 返回 end=true 表示主动收尾；到 maxTurns 时 bench 强制结束，强制结束不算主动收尾。 */
  turn(input: { candidateSaid: string | null; turnIndex: number }): Promise<{ say: string; end?: boolean }>;
  scorecard(): Promise<Scorecard>;
}

export type Submission = {
  name: string;
  /** 面试用的模型与评分卡用的模型（可能不同），榜上如实记；notes 写这个提交吃不吃 norms、有没有别的不对等。 */
  models: { interviewer: string; scorecard: string };
  notes: string;
  create: () => Interviewer;
};

/** 一场的产物：逐字稿 + 评分卡 + 记账。 */
export type Episode = {
  taskId: string;
  submission: string;
  run: number;
  transcript: TranscriptTurn[];
  scorecard: Scorecard | null;
  /** 面试官是否在预算内主动收尾（bench 强制结束记 false）。 */
  endedByInterviewer: boolean;
  /** bench 侧每两回合的等级快照（可选，算"达到正确判断的回合数"用）。 */
  turnScorecards?: { afterTurn: number; levels: Record<string, BenchLevel | null> }[];
  error: string | null;
  durationMs: number;
};
