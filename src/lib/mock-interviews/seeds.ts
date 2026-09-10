import "server-only";

import { prisma } from "@/lib/db";
import { REAL_USAGE_INTERVIEW_WHERE } from "@/lib/interviews/types";

/** 用户点"针对练习"带来的题：备课把它作为要复测的考点，创建表单预填它的岗位。 */
export type MockInterviewSeed = {
  id: string;
  title: string;
  job: {
    applicationId: string | null;
    companyName: string;
    jobTitle: string;
    jobUrl: string;
    jobDescription: string;
  };
};

export async function resolveMockInterviewSeed(seedQuestionId: string | null | undefined): Promise<MockInterviewSeed | null> {
  if (!seedQuestionId) return null;
  const question = await prisma.interviewQuestion.findFirst({
    where: {
      id: seedQuestionId,
      answer: { not: null },
      // 模拟面试里答得薄弱的题同样值得针对性再练，不限于真实面试。
      interview: { ...REAL_USAGE_INTERVIEW_WHERE, status: "completed" },
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
  if (!question) return null;
  return {
    id: question.id,
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
