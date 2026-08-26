import "server-only";

import { assertAiConfigured } from "@/lib/ai/run-agent";
import { prisma } from "@/lib/db";
import { normalizeInterviewRound } from "@/lib/interviews/types";
import { getAiTaskConfig } from "@/lib/settings/ai";

import {
  buildMockInterviewContext,
  serializeMockInterviewContext,
} from "./context";
import { resolveMockInterviewSeed } from "./seeds";
import { parseGenerationSnapshot } from "./session-state";
import {
  MOCK_INTERVIEW_DIFFICULTIES,
  MOCK_INTERVIEW_PROMPT_VERSION,
  isMockInterviewMode,
  type MockInterviewMode,
} from "./types";

/**
 * 模拟面试的对外入口。
 *
 * 创建之后的三段流程各自独立成文件，这里统一转出，调用方（API 路由、后台任务）
 * 不必关心内部怎么分的：
 *   generation.ts —— 出题流水线与失败重试
 *   answering.ts  —— 逐题作答与追问
 *   completion.ts —— 交卷评分与报告
 */
export {
  applyJobDescriptionStrategy,
  claimMockInterviewGenerationRetry,
  generateMockInterviewQuestions,
  type JobDescriptionStrategy,
} from "./generation";
export { submitMockInterviewAnswer } from "./answering";
export { completeMockInterview } from "./completion";

export type CreateMockInterviewInput = {
  companyName: string;
  jobTitle: string;
  resumeId: string;
  jobDescription: string;
  jdOriginalName: string | null;
  round: string | null;
  difficulty: string;
  interactionMode: string;
  questionCount: number;
  followUpsEnabled?: boolean;
  seedQuestionId?: string | null;
  seedInsightId?: string | null;
  applicationId?: string | null;
};

/**
 * 校验投递关联是否真实存在；顺便把本次的岗位描述回填到还没有描述的投递上，
 * 这样用户粘贴一次之后，下次从同一条投递发起就能直接带出。
 */
async function linkApplication(
  applicationId: string | null | undefined,
  jobDescription: string,
): Promise<string | null> {
  if (!applicationId) return null;

  const application = await prisma.bossContact.findUnique({
    where: { id: applicationId },
    select: { id: true, jobDescription: true },
  });
  if (!application) return null;

  if (!application.jobDescription?.trim()) {
    await prisma.bossContact.update({
      where: { id: application.id },
      data: { jobDescription },
    });
  }
  return application.id;
}

function validateCreateInput(input: CreateMockInterviewInput) {
  const companyName = input.companyName.trim();
  const jobTitle = input.jobTitle.trim();
  const jobDescription = input.jobDescription.trim();
  const questionCount = Math.trunc(input.questionCount);
  if (!companyName || companyName.length > 120) throw new Error("请输入有效的公司名称。");
  if (!jobTitle || jobTitle.length > 120) throw new Error("请输入有效的岗位名称。");
  if (!jobDescription || jobDescription.length > 100_000) {
    throw new Error("请上传或粘贴有效的 Job Description。");
  }
  if (questionCount < 3 || questionCount > 12) {
    throw new Error("题目数量必须在 3 到 12 之间。");
  }
  if (!(MOCK_INTERVIEW_DIFFICULTIES as readonly string[]).includes(input.difficulty)) {
    throw new Error("请选择有效的面试难度。");
  }
  if (!isMockInterviewMode(input.interactionMode)) {
    throw new Error("请选择有效的作答方式。");
  }
  return {
    companyName,
    jobTitle,
    jobDescription,
    interactionMode: input.interactionMode as MockInterviewMode,
    questionCount,
  };
}

export async function createMockInterview(input: CreateMockInterviewInput) {
  const validated = validateCreateInput(input);
  const seed = await resolveMockInterviewSeed(input);
  if ((input.seedQuestionId || input.seedInsightId) && !seed) {
    throw new Error("所选训练内容不存在或已不可用，请重新选择。");
  }
  const seedQuestionId = seed?.kind === "question" ? seed.id : null;
  const seedInsightId = seed?.kind === "insight" ? seed.id : null;
  const [context, config, applicationId] = await Promise.all([
    buildMockInterviewContext({
      resumeId: input.resumeId,
      jobTitle: validated.jobTitle,
      jobDescription: validated.jobDescription,
      seedQuestionId,
      seedInsightId,
    }),
    getAiTaskConfig("text"),
    linkApplication(input.applicationId, validated.jobDescription),
  ]);
  assertAiConfigured(config, "AI 模拟面试");
  const now = new Date();
  const snapshot = parseGenerationSnapshot(serializeMockInterviewContext(context));
  snapshot.generationRequest = {
    difficulty: input.difficulty,
    round: input.round,
    seedQuestionId,
    seedInsightId,
  };

  return prisma.interview.create({
    data: {
      kind: "mock",
      companyName: validated.companyName,
      jobTitle: validated.jobTitle,
      // 关联便于回溯这场练习针对哪个岗位；模拟面试不推进投递阶段。
      applicationId,
      scheduledAt: now,
      round: normalizeInterviewRound(input.round),
      status: "generating",
      note: "AI 模拟面试",
      mockSession: {
        create: {
          resumeId: input.resumeId,
          jdOriginalName: input.jdOriginalName,
          jdTextSnapshot: validated.jobDescription,
          resumeTextSnapshot: context.resume.text,
          contextSnapshotJson: JSON.stringify(snapshot),
          status: "generating",
          generationPhase: "job_blueprint",
          followUpsEnabled: input.followUpsEnabled !== false,
          interactionMode: validated.interactionMode,
          questionCount: validated.questionCount,
          provider: config.provider,
          model: config.model,
          promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
        },
      },
    },
    select: { id: true, mockSession: { select: { id: true } } },
  });
}
