import "server-only";

import { prisma } from "@/lib/db";
import { REAL_USAGE_INTERVIEW_WHERE } from "@/lib/interviews/types";
import { parseJsonValue } from "@/lib/json";
import { parseStoredEvaluationList } from "@/lib/mock-interviews/question-evaluation";

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
  weaknesses: string[];
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
      ...REAL_USAGE_INTERVIEW_WHERE,
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
              weaknessesJson: true,
            },
          },
        },
      },
    },
  });

  // 评分 v2 的 strengths / weaknesses 带原话引用，这里只取要点；旧记录是字符串数组，同样兼容。
  const points = (json: string | null) =>
    parseStoredEvaluationList<{ point: string }>(parseJsonValue(json), (point) => ({ point })).map((item) => item.point);
  return interviews.flatMap((interview) =>
    interview.questions.flatMap((question) => {
      if (question.evaluation?.evaluationStatus !== "completed") return [];
      const strengths = points(question.evaluation.strengthsJson);
      const weaknesses = points(question.evaluation.weaknessesJson);
      if (strengths.length === 0 && weaknesses.length === 0) return [];
      return [
        {
          questionId: question.id,
          question: question.question,
          companyName: interview.companyName,
          jobTitle: interview.jobTitle,
          score: question.evaluation.score,
          strengths,
          weaknesses,
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
