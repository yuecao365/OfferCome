import "server-only";

import { getCandidateProfileContext } from "@/lib/candidate-profile/queries";
import { prisma } from "@/lib/db";
import { extractResumeTextFromFile } from "@/lib/resumes/extract";

import type { RelevantPersonalizationContext } from "./relevance";
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
}): Promise<MockInterviewContext> {
  const [resume, historyRows, profile] = await Promise.all([
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
  ]);
  if (!resume) throw new Error("所选简历不存在，请重新选择。");

  const resumeText = await extractResumeTextFromFile(
    resume.filePath,
    resume.mimeType,
  );
  if (!resumeText.trim()) throw new Error("没有从所选简历中提取到文本。");

  const normalizedJobTitle = input.jobTitle.trim().toLocaleLowerCase();
  const sortedHistory = historyRows.toSorted((left, right) => {
    const leftMatch = left.jobTitle.trim().toLocaleLowerCase() === normalizedJobTitle;
    const rightMatch = right.jobTitle.trim().toLocaleLowerCase() === normalizedJobTitle;
    return Number(rightMatch) - Number(leftMatch);
  });
  const history = sortedHistory
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

  const projectsById = new Map<
    string,
    MockInterviewContext["projects"][number]
  >();
  for (const source of resume.projectSources) {
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
    profile,
  };
}

export function serializeMockInterviewContext(
  context: MockInterviewContext,
  generation?: {
    blueprint: MockInterviewJobBlueprint;
    personalization: RelevantPersonalizationContext;
  },
): string {
  return JSON.stringify({
    resumeId: context.resume.id,
    resumeName: context.resume.name,
    projectIds: context.projects.map((project) => project.id),
    historyQuestionIds: context.history.map((item) => item.questionId),
    profileRevision: context.profile.revision,
    profileInsightIds: context.profile.insights.map((insight) => insight.id),
    jobBlueprint: generation?.blueprint ?? null,
    selectedHistoryQuestionIds:
      generation?.personalization.history.map((item) => item.questionId) ?? [],
    selectedProfileInsightIds:
      generation?.personalization.profileInsights.map((item) => item.id) ?? [],
  });
}
