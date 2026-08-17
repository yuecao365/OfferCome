import "server-only";

import { prisma } from "@/lib/db";

export type MockInterviewSeed = {
  id: string;
  kind: "question" | "insight";
  title: string;
  /**
   * 题目来源面试的岗位信息，用于预填创建表单，省掉用户重复输入。
   * 洞察类 seed 跨多场面试，没有单一岗位，保持为 null。
   */
  job: {
    applicationId: string | null;
    companyName: string;
    jobTitle: string;
    jobUrl: string;
    jobDescription: string;
  } | null;
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
      select: {
        id: true,
        question: true,
        interview: {
          select: {
            companyName: true,
            jobTitle: true,
            application: {
              select: { id: true, jobUrl: true, jobDescription: true },
            },
          },
        },
      },
    });
    if (question) {
      return {
        id: question.id,
        kind: "question",
        title: question.question,
        job: {
          applicationId: question.interview.application?.id ?? null,
          companyName: question.interview.companyName,
          jobTitle: question.interview.jobTitle,
          jobUrl: question.interview.application?.jobUrl ?? "",
          jobDescription: question.interview.application?.jobDescription ?? "",
        },
      };
    }
  }

  if (input.seedInsightId) {
    const insight = await prisma.candidateInsight.findFirst({
      where: {
        id: input.seedInsightId,
        kind: { in: ["weakness", "training_focus"] },
      },
      select: { id: true, title: true },
    });
    if (insight) {
      return { id: insight.id, kind: "insight", title: insight.title, job: null };
    }
  }

  return null;
}
