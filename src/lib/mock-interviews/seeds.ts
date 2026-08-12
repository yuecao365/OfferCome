import "server-only";

import { prisma } from "@/lib/db";

export type MockInterviewSeed = {
  id: string;
  kind: "question" | "insight";
  title: string;
};

export async function resolveMockInterviewSeed(input: {
  seedQuestionId?: string | null;
  seedInsightId?: string | null;
}): Promise<MockInterviewSeed | null> {
  if (input.seedQuestionId) {
    const question = await prisma.interviewQuestion.findFirst({
      where: {
        id: input.seedQuestionId,
        answer: { not: null },
        interview: { kind: "real", status: "completed" },
      },
      select: { id: true, question: true },
    });
    if (question) return { id: question.id, kind: "question", title: question.question };
  }

  if (input.seedInsightId) {
    const insight = await prisma.candidateInsight.findFirst({
      where: {
        id: input.seedInsightId,
        kind: { in: ["weakness", "training_focus"] },
      },
      select: { id: true, title: true },
    });
    if (insight) return { id: insight.id, kind: "insight", title: insight.title };
  }

  return null;
}
