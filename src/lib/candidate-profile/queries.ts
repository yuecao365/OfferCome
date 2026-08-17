import "server-only";

import { prisma } from "@/lib/db";

import {
  PROFILE_INSIGHT_KINDS,
  normalizeProfileDimension,
  type CandidateProfileContext,
  type ProfileInsightKind,
} from "./types";
import { ensureCandidateProfileState } from "./state";

function isKind(value: string): value is ProfileInsightKind {
  return (PROFILE_INSIGHT_KINDS as readonly string[]).includes(value);
}

export async function getCandidateProfileContext(): Promise<CandidateProfileContext> {
  const [state, insights] = await Promise.all([
    ensureCandidateProfileState(),
    prisma.candidateInsight.findMany({
      // Disputed conclusions stay visible in the profile, but must not steer mock interview questions.
      where: { roleKey: "all", status: "active", hasConflict: false },
      orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
      take: 18,
    }),
  ]);

  return {
    revision: state.revision,
    insights: insights.flatMap((insight) =>
      normalizeProfileDimension(insight.dimension) && isKind(insight.kind)
        ? [
            {
              id: insight.id,
              dimension: normalizeProfileDimension(insight.dimension)!,
              kind: insight.kind,
              title: insight.title,
              statement: insight.statement,
              confidence: insight.confidence,
            },
          ]
        : [],
    ),
  };
}

export type RecentFeedbackItem = {
  questionId: string;
  question: string;
  companyName: string;
  jobTitle: string;
  score: number | null;
  strengths: string[];
  improvements: string[];
};

/**
 * 冷启动叙事卡的数据源：直接聚合最近几场面试的逐题反馈（评分 agent 已产出，
 * 零额外模型调用）。画像门槛不足时页面靠它保持"有东西可看"。
 */
export async function getRecentQualitativeFeedback(
  limit = 3,
): Promise<RecentFeedbackItem[]> {
  const interviews = await prisma.interview.findMany({
    where: {
      status: "completed",
      questions: { some: { evaluation: { evaluationStatus: "completed" } } },
    },
    orderBy: [{ interviewedAt: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: {
      companyName: true,
      jobTitle: true,
      questions: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          question: true,
          evaluation: {
            select: {
              evaluationStatus: true,
              score: true,
              strengthsJson: true,
              improvementsJson: true,
            },
          },
        },
      },
    },
  });

  const parseList = (json: string | null): string[] => {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  };

  return interviews.flatMap((interview) =>
    interview.questions.flatMap((question) => {
      if (question.evaluation?.evaluationStatus !== "completed") return [];
      const strengths = parseList(question.evaluation.strengthsJson);
      const improvements = parseList(question.evaluation.improvementsJson);
      if (strengths.length === 0 && improvements.length === 0) return [];
      return [
        {
          questionId: question.id,
          question: question.question,
          companyName: interview.companyName,
          jobTitle: interview.jobTitle,
          score: question.evaluation.score,
          strengths,
          improvements,
        },
      ];
    }),
  );
}

export async function getCandidateProfilePageData() {
  const [state, insights, metrics, snapshots, roleContexts, recentRuns] = await Promise.all([
    ensureCandidateProfileState(),
    prisma.candidateInsight.findMany({
      include: {
        evidence: {
          include: {
            interview: {
              select: { companyName: true, jobTitle: true, kind: true, interviewedAt: true },
            },
            question: { select: { question: true, answer: true } },
            observation: {
              select: {
                id: true,
                dimension: true,
                status: true,
                score: true,
                speechMetricsJson: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [
        { status: "asc" },
        { dimension: "asc" },
        { confidence: "desc" },
      ],
    }),
    prisma.candidateProfileMetric.findMany({
      orderBy: [{ roleKey: "asc" }, { dimension: "asc" }],
    }),
    prisma.candidateProfileSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.roleContext.findMany({ orderBy: [{ isPinned: "desc" }, { displayName: "asc" }] }),
    prisma.candidateProfileRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
  ]);

  return { state, insights, metrics, snapshots, roleContexts, recentRuns };
}
