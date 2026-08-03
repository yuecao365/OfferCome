import "server-only";

import { prisma } from "@/lib/db";

import {
  isMockInterviewMode,
  type MockInterviewReport,
  type MockInterviewView,
} from "./types";

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

  return {
    id: session.id,
    interviewId: session.interviewId,
    companyName: session.interview.companyName,
    jobTitle: session.interview.jobTitle,
    status: session.status,
    interactionMode: isMockInterviewMode(session.interactionMode)
      ? session.interactionMode
      : "text",
    currentQuestionIndex: session.currentQuestionIndex,
    questionCount: session.questionCount,
    totalScore: session.totalScore,
    report: session.reportJson
      ? (JSON.parse(session.reportJson) as MockInterviewReport)
      : null,
    questions: session.interview.questions.map((question) => ({
      id: question.id,
      question: question.question,
      answer: question.answer ?? "",
      category: question.category,
      sortOrder: question.sortOrder,
      evaluation:
        session.status === "completed" && question.evaluation
          ? {
              score: question.evaluation.score,
              dimensions: parseArray<{
                name: string;
                score: number;
                evidence: string;
              }>(question.evaluation.dimensionsJson),
              strengths: parseArray<string>(question.evaluation.strengthsJson),
              improvements: parseArray<string>(
                question.evaluation.improvementsJson,
              ),
              feedback: question.evaluation.feedback ?? "",
            }
          : null,
    })),
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
