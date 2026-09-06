import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

import {
  buildPendingResumeExperienceConfirmations,
  resolveResumeExperienceConfirmations,
  toResumeExperienceConfirmationInput,
  type ExistingResumeProjectOption,
  type ResolvedResumeExperienceConfirmations,
} from "./confirmation";
import { extractResumeExperiences } from "./experience-agent";

/**
 * 实习/项目与简历的关联落库。
 *
 * 两条入口共用：上传确认面板（用户核对过）和出题前的自动识别（无人核对）。
 * 关联表 ResumeProjectSource 是"这份简历上出现过哪些项目"的唯一真相，
 * 出题上下文只认它。
 */

type TransactionClient = Prisma.TransactionClient;

export async function getExistingResumeProjectOptions(
  client: Pick<typeof prisma, "resumeProject"> = prisma,
): Promise<ExistingResumeProjectOption[]> {
  return client.resumeProject.findMany({
    orderBy: [{ type: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, organization: true },
  });
}

export async function persistResumeExperiences(
  tx: TransactionClient,
  input: {
    resumeId: string;
    resolved: ResolvedResumeExperienceConfirmations;
    /** 自动识别写入时打上，页面据此标注"未确认"。 */
    autoExtractedAt?: Date | null;
  },
): Promise<{ createdCount: number; linkedCount: number }> {
  for (const item of input.resolved.creates) {
    const project = await tx.resumeProject.create({
      data: {
        resumeId: input.resumeId,
        name: item.name,
        type: item.type,
        organization: item.organization,
        description: item.description,
        startDate: item.startDate,
        endDate: item.endDate,
        sourceText: item.sourceText,
        sortOrder: item.sortOrder,
        autoExtractedAt: input.autoExtractedAt ?? null,
      },
      select: { id: true },
    });
    await tx.resumeProjectSource.create({
      data: {
        resumeId: input.resumeId,
        resumeProjectId: project.id,
        extractedName: item.extractedName,
        finalName: item.finalName,
        sourceText: item.sourceText,
      },
    });
  }

  for (const item of input.resolved.links) {
    await tx.resumeProjectSource.create({
      data: {
        resumeId: input.resumeId,
        resumeProjectId: item.resumeProjectId,
        extractedName: item.extractedName,
        finalName: item.finalName,
        sourceText: item.sourceText,
      },
    });
  }

  return {
    createdCount: input.resolved.creates.length,
    linkedCount: input.resolved.links.length,
  };
}

/** 无人核对时挂到已有条目的门槛：名字高度相似才挂，否则宁可新建一条让用户去合并。 */
const AUTO_LINK_MATCH_THRESHOLD = 0.85;

/**
 * 简历没有任何关联项目时（识别功能接通前上传的、项目随别的版本被删掉的），
 * 出题前自动识别一次并落库。只跑一次：下次直接命中关联表。
 *
 * 识别 agent 自带逐字硬门（标题必须出现在简历原文里）和规则兜底，
 * 所以这里不会凭空造项目；边界、类型、描述可能不准，由项目库页面的
 * "自动识别，未确认"标注交给用户事后修正。
 */
export async function ensureResumeExperiences(input: {
  resumeId: string;
  resumeText: string;
}): Promise<{ createdCount: number; linkedCount: number }> {
  const existingLinks = await prisma.resumeProjectSource.count({
    where: { resumeId: input.resumeId },
  });
  if (existingLinks > 0) return { createdCount: 0, linkedCount: 0 };

  const [extraction, existingProjects] = await Promise.all([
    extractResumeExperiences(input.resumeText),
    getExistingResumeProjectOptions(),
  ]);
  if (extraction.experiences.length === 0) {
    return { createdCount: 0, linkedCount: 0 };
  }

  const inputs = buildPendingResumeExperienceConfirmations(
    extraction.experiences,
    existingProjects,
  ).map((pending) =>
    toResumeExperienceConfirmationInput({
      ...pending,
      selectedExistingItemId:
        pending.matchScore >= AUTO_LINK_MATCH_THRESHOLD
          ? pending.selectedExistingItemId
          : null,
    }),
  );
  const resolved = resolveResumeExperienceConfirmations(inputs, existingProjects);

  return prisma.$transaction(async (tx) => {
    // 并发的两次生成可能同时走到这里；后到的以先到的为准。
    const raced = await tx.resumeProjectSource.count({
      where: { resumeId: input.resumeId },
    });
    if (raced > 0) return { createdCount: 0, linkedCount: 0 };
    return persistResumeExperiences(tx, {
      resumeId: input.resumeId,
      resolved,
      autoExtractedAt: new Date(),
    });
  });
}
