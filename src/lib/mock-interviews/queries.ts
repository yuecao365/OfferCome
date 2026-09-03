import "server-only";

import { prisma } from "@/lib/db";
import { parseJsonArray, parseJsonObject } from "@/lib/json";

import {
  isMockInterviewMode,
  type MockInterviewReport,
  type MockInterviewView,
  storedJobBlueprintSchema,
  type MockInterviewGenerationErrorContext,
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
  return parseJsonArray(value) as T[];
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
  const snapshot = parseJsonObject(session.contextSnapshotJson);
  const blueprint = storedJobBlueprintSchema.safeParse(snapshot.jobBlueprint);
  const reviewCount =
    typeof snapshot.jdReviewCount === "number" ? snapshot.jdReviewCount : 0;
  const generationErrorContext =
    snapshot.generationErrorContext &&
    typeof snapshot.generationErrorContext === "object"
      ? (snapshot.generationErrorContext as MockInterviewGenerationErrorContext)
      : null;
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
    generationErrorContext,
    jobDescriptionReview:
      session.status === "awaiting_jd_review" && blueprint.success
        ? {
            completeness: blueprint.data.completeness,
            missingInformation: blueprint.data.missingInformation,
            canSupplement: reviewCount < 2,
          }
        : null,
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

export async function hasCompletedMockInterview(): Promise<boolean> {
  const count = await prisma.mockInterviewSession.count({
    where: { status: "completed" },
  });
  return count > 0;
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
