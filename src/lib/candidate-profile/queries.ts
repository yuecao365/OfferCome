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
