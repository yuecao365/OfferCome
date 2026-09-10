import "server-only";

import { roleContextKey } from "@/lib/candidate-profile/role-context";
import { parseProfileDimension } from "@/lib/candidate-profile/types";
import { prisma } from "@/lib/db";

import { COMPANY_QUESTION_LIMIT, pickWeakDimensions, type PrepareWeakDimension } from "./prepare-rules";
import { groupQuestionReviewItems, type QuestionReviewItem } from "./review";
import { normalizeInterviewRound, type InterviewRound } from "./types";

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
    const rows = await prisma.candidateProfileMetric.findMany({ where: { roleKey: key } });
    const metrics = rows.flatMap((metric) => {
      const dimension = parseProfileDimension(metric.dimension);
      return dimension ? [{ ...metric, dimension }] : [];
    });
    const insights = await prisma.candidateInsight.findMany({
      where: { roleKey: key, status: "active", kind: { in: ["weakness", "training_focus"] } },
      orderBy: { confidence: "desc" },
      select: { dimension: true, title: true },
    });
    const weakDimensions = pickWeakDimensions(metrics, insights);
    if (weakDimensions.length > 0) return { scope, weakDimensions };
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
