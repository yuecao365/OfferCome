import "server-only";

import { prisma } from "@/lib/db";
import { ensureResumeExperiences } from "@/lib/resumes/experience-store";
import { extractResumeTextFromFile } from "@/lib/resumes/extract";

import { getRecentEvaluatedQuestions, type EvaluatedQuestion } from "./recent-feedback";
import type { MockInterviewJobBlueprint } from "./types";

/** 备课要复测的考点：上几场失守的短板，或用户点"针对练习"指定的题。 */
export type RecentWeakness = {
  /** 失守的领域名；没有领域（真实面试的题）时是题目本身。 */
  area: string;
  point: string;
  /** error 说错了、missing 没答上、practice 用户要求重练。 */
  kind: "error" | "missing" | "practice";
  quote: string | null;
};

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
  recentWeaknesses: RecentWeakness[];
};

/** 最近几场面试取多少条失守点给备课；再多模型也只会挑几条。 */
const RECENT_WEAKNESS_LIMIT = 6;
const RECENT_WEAKNESS_INTERVIEWS = 5;

/**
 * 一道题 → 要复测的点。有短板就用短板；没有评分的题（真实面试）只有在用户指定要练时才带上，
 * 作为"重练"项，让备课围绕这道题开一个领域。
 */
function weaknessesOf(item: EvaluatedQuestion, seeded: boolean): RecentWeakness[] {
  const area = item.areaName ?? item.question.slice(0, 80);
  if (item.weaknesses.length > 0) {
    return item.weaknesses.map((weakness) => ({ area, point: weakness.point, kind: weakness.kind, quote: weakness.quote }));
  }
  return seeded ? [{ area, point: "候选人要求重练这道题。", kind: "practice", quote: null }] : [];
}

export async function buildMockInterviewContext(input: {
  resumeId: string;
  jobTitle: string;
  jobDescription: string;
  seedQuestionId?: string | null;
}): Promise<MockInterviewContext> {
  const [resume, recentQuestions] = await Promise.all([
    prisma.resume.findUnique({
      where: { id: input.resumeId },
      include: {
        projectSources: {
          include: { resumeProject: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    getRecentEvaluatedQuestions({
      limit: RECENT_WEAKNESS_INTERVIEWS,
      jobTitle: input.jobTitle,
      seedQuestionId: input.seedQuestionId,
    }),
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

  const recentWeaknesses = recentQuestions
    .flatMap((item) => weaknessesOf(item, item.questionId === input.seedQuestionId))
    .slice(0, RECENT_WEAKNESS_LIMIT);

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
    recentWeaknesses,
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
    recentWeaknesses: context.recentWeaknesses,
    jobBlueprint: generation?.blueprint ?? null,
  });
}
