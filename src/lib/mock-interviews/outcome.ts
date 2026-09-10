import type { InterviewBrief } from "./interviewer/brief";
import type { InterviewMemory } from "./interviewer/memory";
import { interviewerNote } from "./interviewer/reducer";
import type { EvaluationWeakness } from "./question-evaluation";
import { REPORT_VERSION, type MockInterviewReport } from "./report";
import { computeInterviewTotalScore } from "./scoring";
import type { SummaryInput, SummaryOutput } from "./summary-agent";

/**
 * 交卷的纯逻辑：把简报、线程与带评分的兼容题目拼成汇总 agent 的输入与报告。
 * 本地版从数据库读行喂进来（completion.ts），体验版从浏览器的会话文档喂进来。
 */

export type OutcomeThread = {
  areaId: string;
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

/** 每个问到过的领域：几条线程的深度、判断、分数与短板；跳过的线程记 0 分。 */
export function areaOutcomes(brief: InterviewBrief, threads: OutcomeThread[], questions: OutcomeQuestion[]): AreaOutcome[] {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  return brief.areas.flatMap((area) => {
    const own = threads.filter((thread) => thread.areaId === area.id && thread.status !== "active");
    if (own.length === 0) return [];
    const asked = own.map((thread) => (thread.questionId ? (questionById.get(thread.questionId) ?? null) : null));
    const scores = asked.map((question) => question?.evaluation?.score ?? 0);
    const answered = asked.filter((question) => question && !question.skipped);
    const best = asked.reduce<OutcomeQuestion | null>(
      (top, question) => (question && (question.evaluation?.score ?? 0) >= (top?.evaluation?.score ?? -1) ? question : top),
      null,
    );
    return [
      {
        scores,
        summary: {
          name: area.name,
          kind: area.kind,
          style: area.style,
          weight: area.weight,
          depthReached: Math.max(0, ...own.map((thread) => thread.depth)),
          targetDepth: area.depth,
          threadNote: interviewerNote(own.at(-1)?.note ?? null),
          skipped: answered.length === 0,
          score: answered.length > 0 ? Math.max(...scores) : null,
          weaknesses: best?.evaluation?.weaknesses ?? [],
        },
      },
    ];
  });
}

export function summaryInput(input: {
  jobTitle: string;
  brief: InterviewBrief;
  areas: AreaOutcome[];
  memory: InterviewMemory;
}): SummaryInput {
  return {
    jobTitle: input.jobTitle,
    round: input.brief.round,
    pace: input.brief.pace,
    areas: input.areas.map((area) => area.summary),
    memory: {
      established: input.memory.established,
      doubtful: input.memory.doubtful,
      failed: input.memory.failed,
    },
    hypotheses: input.brief.hypotheses.map((hypothesis) => {
      const state = input.memory.hypotheses.find((item) => item.id === hypothesis.id);
      return { text: hypothesis.text, status: state?.status ?? "open", note: state?.note ?? null };
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
