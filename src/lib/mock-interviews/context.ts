import "server-only";

import { getCandidateProfileContext } from "@/lib/candidate-profile/queries";
import { normalizeProfileDimension } from "@/lib/candidate-profile/types";
import { prisma } from "@/lib/db";
import { ensureResumeExperiences } from "@/lib/resumes/experience-store";
import { extractResumeTextFromFile } from "@/lib/resumes/extract";

import type { MockInterviewJobBlueprint } from "./types";

export type MockInterviewContext = {
  jobDescription: string;
  resume: { id: string; name: string; text: string };
  projects: {
    id: string;
    name: string;
    type: string;
    organization: string;
    description: string;
  }[];
  history: {
    interviewId: string;
    companyName: string;
    jobTitle: string;
    questionId: string;
    question: string;
    answer: string;
    category: string;
  }[];
  profile: Awaited<ReturnType<typeof getCandidateProfileContext>>;
};

export async function buildMockInterviewContext(input: {
  resumeId: string;
  jobTitle: string;
  jobDescription: string;
  seedQuestionId?: string | null;
  seedInsightId?: string | null;
}): Promise<MockInterviewContext> {
  const [resume, historyRows, profile, seedQuestion, seedInsight] = await Promise.all([
    prisma.resume.findUnique({
      where: { id: input.resumeId },
      include: {
        projectSources: {
          include: { resumeProject: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.interview.findMany({
      where: {
        kind: "real",
        status: "completed",
        questions: { some: { answer: { not: null } } },
      },
      include: { questions: { orderBy: { sortOrder: "asc" } } },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
    getCandidateProfileContext(),
    input.seedQuestionId
      ? prisma.interviewQuestion.findFirst({
          where: {
            id: input.seedQuestionId,
            answer: { not: null },
            interview: { kind: "real", status: "completed" },
          },
          include: { interview: true },
        })
      : null,
    input.seedInsightId
      ? prisma.candidateInsight.findFirst({
          where: {
            id: input.seedInsightId,
            kind: { in: ["weakness", "training_focus"] },
          },
        })
      : null,
  ]);
  if (!resume) throw new Error("所选简历不存在，请重新选择。");

  const resumeText = await extractResumeTextFromFile(
    resume.filePath,
    resume.mimeType,
  );
  if (!resumeText.trim()) throw new Error("没有从所选简历中提取到文本。");

  // 出题只考察这份简历上的实习/项目，以关联表为准。简历从没识别过
  // （识别功能接通前上传、或项目随别的版本被删掉）就先自动识别一次并落库；
  // 识别失败不拦路，没有项目时提示词会声明本场不出 resume 题。
  let projectSources = resume.projectSources;
  if (projectSources.length === 0) {
    try {
      await ensureResumeExperiences({ resumeId: resume.id, resumeText });
      projectSources = await prisma.resumeProjectSource.findMany({
        where: { resumeId: resume.id },
        include: { resumeProject: true },
        orderBy: { createdAt: "asc" },
      });
    } catch (error) {
      console.warn(
        "[mock-interviews] auto resume experience extraction failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }

  const normalizedJobTitle = input.jobTitle.trim().toLocaleLowerCase();
  const sortedHistory = historyRows.toSorted((left, right) => {
    const leftMatch = left.jobTitle.trim().toLocaleLowerCase() === normalizedJobTitle;
    const rightMatch = right.jobTitle.trim().toLocaleLowerCase() === normalizedJobTitle;
    return Number(rightMatch) - Number(leftMatch);
  });
  let history = sortedHistory
    .flatMap((interview) =>
      interview.questions.flatMap((question) => {
        const answer = question.answer?.trim();
        if (!answer) return [];
        return [
          {
            interviewId: interview.id,
            companyName: interview.companyName,
            jobTitle: interview.jobTitle,
            questionId: question.id,
            question: question.question,
            answer: answer.slice(0, 2_000),
            category: question.category,
          },
        ];
      }),
    )
    .slice(0, 30);
  if (seedQuestion?.answer && !history.some((item) => item.questionId === seedQuestion.id)) {
    history = [
      {
        interviewId: seedQuestion.interview.id,
        companyName: seedQuestion.interview.companyName,
        jobTitle: seedQuestion.interview.jobTitle,
        questionId: seedQuestion.id,
        question: seedQuestion.question,
        answer: seedQuestion.answer.slice(0, 2_000),
        category: seedQuestion.category,
      },
      ...history.slice(0, 29),
    ];
  }

  const profileInsights = [...profile.insights];
  if (seedInsight && !profileInsights.some((item) => item.id === seedInsight.id)) {
    const dimension = normalizeProfileDimension(seedInsight.dimension);
    if (dimension) {
      profileInsights.unshift({
        id: seedInsight.id,
        dimension,
        kind: seedInsight.kind as "weakness" | "training_focus",
        title: seedInsight.title,
        statement: seedInsight.statement,
        confidence: seedInsight.confidence,
      });
    }
  }

  const projectsById = new Map<
    string,
    MockInterviewContext["projects"][number]
  >();
  for (const source of projectSources) {
    const project = source.resumeProject;
    projectsById.set(project.id, {
      id: project.id,
      name: project.name,
      type: project.type,
      organization: project.organization ?? "",
      description: (project.description ?? project.sourceText ?? "").slice(0, 2_000),
    });
  }

  return {
    jobDescription: input.jobDescription.trim().slice(0, 30_000),
    resume: {
      id: resume.id,
      name: resume.originalName,
      text: resumeText.trim().slice(0, 30_000),
    },
    projects: Array.from(projectsById.values()),
    history,
    profile: { ...profile, insights: profileInsights },
  };
}

export function serializeMockInterviewContext(
  context: MockInterviewContext,
  generation?: { blueprint: MockInterviewJobBlueprint },
): string {
  return JSON.stringify({
    resumeId: context.resume.id,
    resumeName: context.resume.name,
    projectIds: context.projects.map((project) => project.id),
    historyQuestionIds: context.history.map((item) => item.questionId),
    profileRevision: context.profile.revision,
    profileInsightIds: context.profile.insights.map((insight) => insight.id),
    jobBlueprint: generation?.blueprint ?? null,
  });
}
