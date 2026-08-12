import "server-only";

import { prisma } from "@/lib/db";

import {
  isMockInterviewMode,
  type MockInterviewReport,
  type MockInterviewView,
} from "./types";
import { buildQuestionTeaching } from "./teaching";
import { parsePersonalizationSourceIds } from "./personalization";

async function getProfileContributionCount(
  interviewId: string,
): Promise<number | null> {
  const assessment = await prisma.interviewAssessment.findFirst({
    where: { interviewId, status: "completed" },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (!assessment) return null;

  return prisma.abilityObservation.count({
    where: { assessmentId: assessment.id, status: "active" },
  });
}

async function getCompletedReportContext(
  interviewId: string,
  contextSnapshotJson: string,
) {
  const sourceIds = parsePersonalizationSourceIds(contextSnapshotJson);
  const [profileRows, historyRows, profileContributionCount] =
    await Promise.all([
      prisma.candidateInsight.findMany({
        where: { id: { in: sourceIds.profileInsightIds } },
        select: { id: true, title: true, kind: true },
      }),
      prisma.interviewQuestion.findMany({
        where: { id: { in: sourceIds.historyQuestionIds } },
        select: {
          id: true,
          question: true,
          interview: { select: { companyName: true } },
        },
      }),
      getProfileContributionCount(interviewId),
    ]);
  const profileById = new Map(profileRows.map((row) => [row.id, row]));
  const historyById = new Map(historyRows.map((row) => [row.id, row]));

  return {
    personalizationUsed: {
      profileInsights: sourceIds.profileInsightIds.flatMap((id) => {
        const row = profileById.get(id);
        return row ? [row] : [];
      }),
      historyQuestions: sourceIds.historyQuestionIds.flatMap((id) => {
        const row = historyById.get(id);
        return row
          ? [
              {
                id: row.id,
                question: row.question,
                companyName: row.interview.companyName,
              },
            ]
          : [];
      }),
    },
    profileContributionCount,
  };
}

function parseArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function getMockInterviewView(id: string): Promise<MockInterviewView | null> {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id },
    include: {
      interview: {
        include: {
          questions: {
            include: { evaluation: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  if (!session) return null;
  const completedReportContext =
    session.status === "completed"
      ? await getCompletedReportContext(
          session.interviewId,
          session.contextSnapshotJson,
        )
      : null;

  return {
    id: session.id,
    interviewId: session.interviewId,
    companyName: session.interview.companyName,
    jobTitle: session.interview.jobTitle,
    status: session.status,
    generationPhase: session.generationPhase,
    generationErrorCode: session.generationErrorCode,
    generationError: session.generationError,
    interactionMode: isMockInterviewMode(session.interactionMode)
      ? session.interactionMode
      : "text",
    currentQuestionIndex: session.currentQuestionIndex,
    questionCount: session.questionCount,
    totalScore: session.totalScore,
    report: session.reportJson
      ? (JSON.parse(session.reportJson) as MockInterviewReport)
      : null,
    ...(completedReportContext ?? {}),
    questions: session.interview.questions.map((question) => {
      const completedEvaluation =
        session.status === "completed" ? question.evaluation : null;

      return {
        id: question.id,
        question: question.question,
        answer: question.answer ?? "",
        category: question.category,
        sortOrder: question.sortOrder,
        skipped: Boolean(question.skippedAt),
        isFollowUp: Boolean(question.parentQuestionId),
        parentQuestionId: question.parentQuestionId,
        ...(completedEvaluation
          ? {
              teaching: buildQuestionTeaching(
                session.contextSnapshotJson,
                completedEvaluation,
              ),
            }
          : {}),
        evaluation: completedEvaluation
          ? {
              score: completedEvaluation.score,
              dimensions: parseArray<{
                name: string;
                score: number;
                evidence: string;
              }>(completedEvaluation.dimensionsJson),
              strengths: parseArray<string>(completedEvaluation.strengthsJson),
              improvements: parseArray<string>(
                completedEvaluation.improvementsJson,
              ),
              feedback: completedEvaluation.feedback ?? "",
            }
          : null,
      };
    }),
  };
}

export async function getRecentMockInterviews() {
  return prisma.mockInterviewSession.findMany({
    include: {
      interview: {
        select: { companyName: true, jobTitle: true, updatedAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
}
