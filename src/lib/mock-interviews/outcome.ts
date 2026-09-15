import { isAreaKind, KIND_WEIGHT, type InterviewBrief } from "./brief/brief";
import type { EvaluationWeakness } from "./question-evaluation";
import { REPORT_VERSION, type MockInterviewReport } from "./report";
import { computeInterviewTotalScore } from "./scoring";
import type { SummaryInput, SummaryOutput } from "./summary-agent";

/**
 * 交卷的纯逻辑：把简报、线程与带评分的兼容题目拼成汇总 agent 的输入与报告。
 * 本地版从数据库读行喂进来（completion.ts），体验版从浏览器的会话文档喂进来。
 */

export type OutcomeThread = {
  areaId: string | null;
  kind: string;
  label: string;
  status: string;
  depth: number;
  note: string | null;
  questionId: string | null;
};

export type OutcomeQuestion = {
  id: string;
  skipped: boolean;
  evaluation: { score: number | null; weaknesses: EvaluationWeakness[] } | null;
};

export type AreaOutcome = { summary: SummaryInput["areas"][number]; scores: number[] };

/** 每个聊过的话题：种类、追问轮数、面试官判断、分数与短板；跳过的记 0 分。权重按种类（项目 3、场景 2、基础 1）。 */
export function areaOutcomes(_brief: InterviewBrief, threads: OutcomeThread[], questions: OutcomeQuestion[]): AreaOutcome[] {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  return threads.flatMap((thread) => {
    if (thread.status === "active") return [];
    const kind = isAreaKind(thread.kind) ? thread.kind : "quick";
    const question = thread.questionId ? (questionById.get(thread.questionId) ?? null) : null;
    const answered = question !== null && !question.skipped;
    return [
      {
        scores: [question?.evaluation?.score ?? 0],
        summary: {
          name: thread.label,
          kind,
          weight: KIND_WEIGHT[kind],
          depthReached: thread.depth,
          threadNote: thread.note,
          skipped: !answered,
          score: answered ? (question.evaluation?.score ?? null) : null,
          weaknesses: question?.evaluation?.weaknesses ?? [],
        },
      },
    ];
  });
}

export function summaryInput(input: {
  jobTitle: string;
  brief: InterviewBrief;
  areas: AreaOutcome[];
  notebook: string;
  /** 整理员对简历假设的判断；没有（旧会话）按 open。 */
  hypotheses: { id: string; status: "open" | "confirmed" | "refuted"; note: string | null }[];
}): SummaryInput {
  const judged = new Map(input.hypotheses.map((item) => [item.id, item]));
  return {
    jobTitle: input.jobTitle,
    round: input.brief.round,
    pace: input.brief.pace,
    areas: input.areas.map((area) => area.summary),
    notebook: input.notebook,
    hypotheses: input.brief.hypotheses.map((hypothesis) => {
      const item = judged.get(hypothesis.id);
      return { text: hypothesis.text, status: item?.status ?? "open", note: item?.note ?? null };
    }),
  };
}

/** 全场都跳过时不调模型，用固定文案。 */
export const ALL_SKIPPED_SUMMARY: SummaryOutput = {
  summary: "本场所有题目均已跳过，暂时没有可评分的回答。",
  strengths: [],
  weaknesses: [],
  advice: ["重新发起一场模拟面试，并尝试完整回答至少一道题。"],
  hypotheses: [],
};

export function buildReport(areas: AreaOutcome[], summary: SummaryOutput): MockInterviewReport {
  return {
    version: REPORT_VERSION,
    totalScore: computeInterviewTotalScore(areas.map((area) => ({ weight: area.summary.weight, scores: area.scores }))),
    ...summary,
  };
}
