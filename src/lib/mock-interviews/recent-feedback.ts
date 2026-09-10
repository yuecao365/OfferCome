import "server-only";

import { prisma } from "@/lib/db";
import { REAL_USAGE_INTERVIEW_WHERE } from "@/lib/interviews/types";
import { parseJsonObject, parseJsonValue } from "@/lib/json";

import { parseStoredEvaluationList, type EvaluationWeakness } from "./question-evaluation";

/**
 * 最近几场面试的逐题反馈（评分 agent 已产出，零模型调用）。
 * 两个消费方：画像页冷启动的"近期定性反馈"卡，以及下一场备课的"最近失守的考点"。
 */
export type EvaluatedQuestion = {
  questionId: string;
  question: string;
  companyName: string;
  jobTitle: string;
  /** 这段考的领域名；真实面试的题没有。 */
  areaName: string | null;
  strengths: string[];
  weaknesses: EvaluationWeakness[];
};

const QUESTION_SELECT = {
  id: true,
  question: true,
  interview: { select: { companyName: true, jobTitle: true } },
  evaluation: {
    select: {
      evaluationStatus: true,
      strengthsJson: true,
      weaknessesJson: true,
      generationMetadataJson: true,
    },
  },
} as const;

type QuestionRow = {
  id: string;
  question: string;
  interview: { companyName: string; jobTitle: string };
  evaluation: {
    evaluationStatus: string;
    strengthsJson: string | null;
    weaknessesJson: string | null;
    generationMetadataJson: string;
  } | null;
};

function toEvaluatedQuestion(row: QuestionRow): EvaluatedQuestion {
  const evaluation = row.evaluation?.evaluationStatus === "completed" ? row.evaluation : null;
  const areaName = evaluation ? parseJsonObject(evaluation.generationMetadataJson).areaName : null;
  return {
    questionId: row.id,
    question: row.question,
    companyName: row.interview.companyName,
    jobTitle: row.interview.jobTitle,
    areaName: typeof areaName === "string" ? areaName : null,
    strengths: parseStoredEvaluationList<{ point: string }>(parseJsonValue(evaluation?.strengthsJson ?? null), (point) => ({ point })).map((item) => item.point),
    weaknesses: parseStoredEvaluationList<EvaluationWeakness>(parseJsonValue(evaluation?.weaknessesJson ?? null), (point) => ({ point, quote: null, kind: "missing" })),
  };
}

/**
 * 最近 `limit` 场有完成评分的面试的题，按面试时间倒序；给了岗位名时同岗位的排前面。
 * `seedQuestionId` 指定的题（用户点"针对练习"带来的）放在最前，即使它来自真实面试、没有评分。
 */
export async function getRecentEvaluatedQuestions(options: {
  limit?: number;
  jobTitle?: string;
  seedQuestionId?: string | null;
} = {}): Promise<EvaluatedQuestion[]> {
  const [interviews, seed] = await Promise.all([
    prisma.interview.findMany({
      where: {
        ...REAL_USAGE_INTERVIEW_WHERE,
        status: "completed",
        questions: { some: { evaluation: { evaluationStatus: "completed" } } },
      },
      orderBy: [{ interviewedAt: "desc" }, { updatedAt: "desc" }],
      take: options.limit ?? 3,
      select: { jobTitle: true, questions: { orderBy: { sortOrder: "asc" }, select: QUESTION_SELECT } },
    }),
    options.seedQuestionId
      ? prisma.interviewQuestion.findFirst({
          where: {
            id: options.seedQuestionId,
            answer: { not: null },
            interview: { ...REAL_USAGE_INTERVIEW_WHERE, status: "completed" },
          },
          select: QUESTION_SELECT,
        })
      : null,
  ]);

  const wanted = options.jobTitle?.trim().toLocaleLowerCase();
  const ordered = wanted
    ? interviews.toSorted((left, right) =>
        Number(right.jobTitle.trim().toLocaleLowerCase() === wanted) - Number(left.jobTitle.trim().toLocaleLowerCase() === wanted),
      )
    : interviews;
  const questions = ordered
    .flatMap((interview) => interview.questions)
    .filter((row) => row.evaluation?.evaluationStatus === "completed" && row.id !== seed?.id)
    .map(toEvaluatedQuestion);
  return seed ? [toEvaluatedQuestion(seed), ...questions] : questions;
}
