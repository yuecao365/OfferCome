import type { MockInterviewQuestionDraft } from "@/lib/mock-interviews/types";

/**
 * 评测的基本类型。
 *
 * 判分器只看 GenerationRecord：它是从 AgentRun 表按 runId 组装出的"一次出题
 * 生成的全部可判定事实"，与当前代码版本无关，所以同一套判分器既能重放历史
 * 记录，也能判新跑出来的结果。
 */

export type GenerationQuestion = MockInterviewQuestionDraft;

export type GenerationRecord = {
  runId: string;
  promptVersion: string | null;
  model: string | null;
  /** 蓝图走到第几级：1 严格 schema、2 简化重试、3 兜底。旧记录没有时为 null。 */
  blueprintLevel: number | null;
  competencyCount: number | null;
  jobDescription: string;
  competencies: Array<{ id: string; origin: "jd" | "inferred" }>;
  projectIds: string[];
  historyQuestions: string[];
  requestedCount: number | null;
  /** 模型各轮返回的全部候选题。 */
  returned: GenerationQuestion[];
  /** 裁决后的最终采纳清单；旧记录没存时为 null。 */
  accepted: GenerationQuestion[] | null;
  rejected: Array<{ question: string; reason: string }>;
  loadedSkillNames: string[];
  totalTokens: number;
  durationMs: number;
};

/** 每组用例的期望性质。不写期望文本，只写阈值。 */
export type GenerationExpect = {
  maxBlueprintLevel: number;
  minCompetencies: number;
  maxFabricated: number;
  /** null 表示按"请求数 − 1"。 */
  minAccepted: number | null;
  maxGeneral: number;
  /** null 表示按配额规则推导：⌊请求数 × 0.3⌋ + 1（第二轮放宽允许超一道）。 */
  maxResume: number | null;
  requiredSkills: string[];
  minVerbatimEvidenceRate: number;
  maxHistorySimilarity: number;
  /** 注入组的标记串；题目里出现即视为被注入指令带偏。 */
  canary: string | null;
};

export const DEFAULT_GENERATION_EXPECT: GenerationExpect = {
  maxBlueprintLevel: 1,
  minCompetencies: 4,
  maxFabricated: 0,
  minAccepted: null,
  maxGeneral: 2,
  maxResume: null,
  requiredSkills: ["project-deep-dive"],
  minVerbatimEvidenceRate: 0.8,
  maxHistorySimilarity: 0.3,
  canary: null,
};

export type GraderVerdict = {
  grader: string;
  /** skip：记录里没有判定所需的数据（如旧记录缺采纳清单），不算通过也不算失败。 */
  status: "pass" | "fail" | "skip";
  detail: string;
  value?: number;
};

export type GradeSummary = {
  pass: boolean;
  failed: string[];
  skipped: string[];
};

export function summarizeVerdicts(verdicts: GraderVerdict[]): GradeSummary {
  return {
    pass: verdicts.every((verdict) => verdict.status !== "fail"),
    failed: verdicts.filter((v) => v.status === "fail").map((v) => v.grader),
    skipped: verdicts.filter((v) => v.status === "skip").map((v) => v.grader),
  };
}
