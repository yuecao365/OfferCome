/**
 * InterviewBench 端到端层的数据形状（eval/bench/README.md §2、§3、§5）。
 * bench 拥有任务、候选人与评分器；提交者只实现 Interviewer。这里不引用本项目面试流程的任何类型。
 */

export const BENCH_LEVELS = ["low", "medium", "high"] as const;
export type BenchLevel = (typeof BENCH_LEVELS)[number];

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

export type Fact =
  | { type: "wrong"; topic: string; says: string; whyWrong: string }
  | { type: "inflated"; topic: string; resume: string; says: string }
  | { type: "hollow"; topic: string; resume: string };

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

/** 面试官看到的任务：没有候选人档案。 */
export type TaskForInterviewer = Pick<Task, "id" | "job" | "resume" | "competencies" | "budget">;

export type ScorecardRating = { competencyId: string; level: 1 | 2 | 3 | 4; evidence: string };
export type RedFlag = { type: FactType; quote: string; note: string };
export const OVERALLS = ["strong_no_hire", "no_hire", "hire", "strong_hire"] as const;
export type Overall = (typeof OVERALLS)[number];
export type Scorecard = { ratings: ScorecardRating[]; redFlags: RedFlag[]; overall: Overall; summary: string };

/** 逐字稿一行。候选人行带 bench 侧才知道的标记（说了哪条埋点、这句是不是答不上），提交者看不到。 */
export type TranscriptTurn =
  | { role: "interviewer"; index: number; text: string; end: boolean }
  | { role: "candidate"; index: number; text: string; couldNotAnswer: boolean; factsSaid: number[] };

/** 提交者要实现的接口（README §2）。 */
export interface Interviewer {
  start(input: TaskForInterviewer): Promise<void>;
  turn(input: { candidateSaid: string | null; turnIndex: number }): Promise<{ say: string; end?: boolean }>;
  scorecard(): Promise<Scorecard>;
}

export type Submission = { name: string; family: string; create: () => Interviewer };

/** 一场的产物：逐字稿 + 评分卡 + 记账。 */
export type Episode = {
  taskId: string;
  submission: string;
  run: number;
  transcript: TranscriptTurn[];
  scorecard: Scorecard | null;
  /** bench 侧每回合的评分卡（可选，算"达到正确判断的回合数"用）。 */
  turnScorecards?: { afterTurn: number; levels: Record<string, BenchLevel | null> }[];
  error: string | null;
  durationMs: number;
};
