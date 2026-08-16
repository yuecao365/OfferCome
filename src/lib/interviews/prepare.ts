import "server-only";

import { roleContextKey } from "@/lib/candidate-profile/role-context";
import {
  PROFILE_DIMENSION_LABELS,
  normalizeProfileDimension,
  type ProfileDimension,
} from "@/lib/candidate-profile/types";
import { prisma } from "@/lib/db";

import { groupQuestionReviewItems, type QuestionReviewItem } from "./review";
import { normalizeInterviewRound, type InterviewRound } from "./types";

/** 备战页最多展示的历史问题组数，够看又不至于淹没重点。 */
const COMPANY_QUESTION_LIMIT = 10;
/** 弱项维度展示数量。 */
const WEAK_DIMENSION_LIMIT = 2;
/** 与画像一致：不足两场有效面试的维度不下结论。 */
const MIN_INTERVIEWS_FOR_METRIC = 2;

export type PrepareWeakDimension = {
  dimension: ProfileDimension;
  label: string;
  levelLabel: string;
  insightTitles: string[];
};

export type InterviewPrepareData = {
  interview: {
    id: string;
    companyName: string;
    jobTitle: string;
    round: InterviewRound | null;
    interviewedAt: Date;
    applicationId: string | null;
    jobUrl: string;
  };
  companyQuestions: QuestionReviewItem[];
  weakDimensions: PrepareWeakDimension[];
  /** 弱项来自岗位视角还是全局画像，用于向用户说明依据。 */
  weakDimensionScope: "role" | "all" | "none";
};

/** 同一家公司此前问过什么——直接复用复盘的聚合逻辑。 */
async function getCompanyQuestions(
  companyName: string,
  excludeInterviewId: string,
): Promise<QuestionReviewItem[]> {
  const rows = await prisma.interviewQuestion.findMany({
    where: {
      question: { not: "" },
      answer: { not: null },
      AND: [{ answer: { not: "" } }],
      interview: {
        kind: "real",
        status: "completed",
        companyName,
        id: { not: excludeInterviewId },
      },
    },
    include: {
      interview: {
        select: {
          id: true,
          kind: true,
          companyName: true,
          jobTitle: true,
          interviewedAt: true,
          scheduledAt: true,
          round: true,
        },
      },
    },
    orderBy: [{ interview: { interviewedAt: "desc" } }, { sortOrder: "asc" }],
  });

  return groupQuestionReviewItems(rows).slice(0, COMPANY_QUESTION_LIMIT);
}

/**
 * 这类岗位上你最弱的维度。优先用岗位视角的画像，没有足够数据时回退到全局。
 */
async function getWeakDimensions(jobTitle: string): Promise<{
  weakDimensions: PrepareWeakDimension[];
  scope: InterviewPrepareData["weakDimensionScope"];
}> {
  const roleKey = roleContextKey(jobTitle);

  for (const [scope, key] of [
    ["role", roleKey],
    ["all", "all"],
  ] as const) {
    const metrics = await prisma.candidateProfileMetric.findMany({
      where: {
        roleKey: key,
        interviewCount: { gte: MIN_INTERVIEWS_FOR_METRIC },
        level: { not: null },
      },
      orderBy: { level: "asc" },
      take: WEAK_DIMENSION_LIMIT,
    });
    if (metrics.length === 0) continue;

    const dimensions = metrics.flatMap((metric) => {
      const dimension = normalizeProfileDimension(metric.dimension);
      return dimension ? [{ metric, dimension }] : [];
    });
    if (dimensions.length === 0) continue;

    const insights = await prisma.candidateInsight.findMany({
      where: {
        roleKey: key,
        status: "active",
        kind: { in: ["weakness", "training_focus"] },
        dimension: { in: dimensions.map((item) => item.dimension) },
      },
      orderBy: { confidence: "desc" },
      select: { dimension: true, title: true },
    });

    return {
      scope,
      weakDimensions: dimensions.map(({ metric, dimension }) => ({
        dimension,
        label: PROFILE_DIMENSION_LABELS[dimension],
        levelLabel: metric.levelLabel,
        insightTitles: insights
          .filter((insight) => insight.dimension === dimension)
          .map((insight) => insight.title)
          .slice(0, 2),
      })),
    };
  }

  return { weakDimensions: [], scope: "none" };
}

export async function getInterviewPrepareData(
  interviewId: string,
): Promise<InterviewPrepareData | null> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      kind: true,
      status: true,
      companyName: true,
      jobTitle: true,
      round: true,
      interviewedAt: true,
      applicationId: true,
      application: { select: { jobUrl: true } },
    },
  });
  if (
    !interview ||
    interview.kind !== "real" ||
    interview.status !== "scheduled" ||
    !interview.interviewedAt
  ) {
    return null;
  }

  const [companyQuestions, weak] = await Promise.all([
    getCompanyQuestions(interview.companyName, interview.id),
    getWeakDimensions(interview.jobTitle),
  ]);

  return {
    interview: {
      id: interview.id,
      companyName: interview.companyName,
      jobTitle: interview.jobTitle,
      round: normalizeInterviewRound(interview.round),
      interviewedAt: interview.interviewedAt,
      applicationId: interview.applicationId,
      jobUrl: interview.application?.jobUrl ?? "",
    },
    companyQuestions,
    weakDimensions: weak.weakDimensions,
    weakDimensionScope: weak.scope,
  };
}
