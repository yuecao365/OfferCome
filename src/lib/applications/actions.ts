"use server";

import { prisma } from "@/lib/db";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale, getMessages } from "@/lib/i18n/server";

import type { ApplicationActionState } from "./action-state";
import { parseApplicationFormData } from "./form";
import { revalidateApplicationRoutes } from "./revalidate";
import { isApplicationStage, type ApplicationStage } from "./types";

const messages = defineMessages({
  "zh-CN": {
    duplicate: "这条投递记录已存在。",
    saveFailed: "保存失败，请稍后重试。",
    created: "投递记录已创建。",
    updateFailed: "更新失败，请稍后重试。",
    updated: "投递记录已更新。",
    invalidStage: "无效的投递状态。",
    notFound: "没有找到这条投递记录。",
  },
  en: {
    duplicate: "This application already exists.",
    saveFailed: "Couldn't save. Try again later.",
    created: "Application added.",
    updateFailed: "Couldn't update. Try again later.",
    updated: "Application updated.",
    invalidStage: "Invalid application status.",
    notFound: "Application not found.",
  },
});

export async function createApplication(
  _prevState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const locale = await getLocale();
  const t = messages[locale];
  const parsed = parseApplicationFormData(formData, locale);
  if (!parsed.ok) {
    return { status: "error", message: parsed.message };
  }

  try {
    const now = new Date();
    await prisma.bossContact.create({
      data: {
        companyName: parsed.value.companyName,
        jobTitle: parsed.value.jobTitle,
        source: parsed.value.source,
        sourceKey: parsed.value.sourceKey,
        jobUrl: parsed.value.jobUrl,
        jobDescription: parsed.value.jobDescription,
        appliedAt: parsed.value.appliedAt,
        stage: parsed.value.stage,
        note: parsed.value.note,
        firstSeenAt: parsed.value.appliedAt,
        lastSeenAt: now,
        unchangedSince: now,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("unique")
    ) {
      return { status: "error", message: t.duplicate };
    }
    return { status: "error", message: t.saveFailed };
  }

  revalidateApplicationRoutes();
  return { status: "success", message: t.created };
}

export async function updateApplication(
  id: string,
  _prevState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const locale = await getLocale();
  const t = messages[locale];
  const parsed = parseApplicationFormData(formData, locale);
  if (!parsed.ok) {
    return { status: "error", message: parsed.message };
  }

  try {
    await prisma.bossContact.update({
      where: { id },
      data: {
        companyName: parsed.value.companyName,
        jobTitle: parsed.value.jobTitle,
        source: parsed.value.source,
        jobUrl: parsed.value.jobUrl,
        jobDescription: parsed.value.jobDescription,
        appliedAt: parsed.value.appliedAt,
        stage: parsed.value.stage,
        note: parsed.value.note,
        autoRejectedAt: null,
        unchangedSince: new Date(),
      },
    });
  } catch {
    return { status: "error", message: t.updateFailed };
  }

  revalidateApplicationRoutes();
  return { status: "success", message: t.updated };
}

/**
 * 只改阶段，用于同步结果弹窗里对有新互动的岗位快速定状态。
 * 用 sourceKey 定位，因为同步结果里带的是它而不是数据库 id。
 */
export async function updateApplicationStage(
  sourceKey: string,
  stage: string,
): Promise<{ ok: boolean; message?: string }> {
  const t = await getMessages(messages);
  if (!isApplicationStage(stage)) {
    return { ok: false, message: t.invalidStage };
  }

  try {
    const updated = await prisma.bossContact.updateMany({
      where: { sourceKey },
      data: {
        stage: stage satisfies ApplicationStage,
        // 用户手动定过状态后，不该再被自动拒绝逻辑改写。
        autoRejectedAt: null,
        unchangedSince: new Date(),
      },
    });
    if (updated.count === 0) {
      return { ok: false, message: t.notFound };
    }
  } catch {
    return { ok: false, message: t.updateFailed };
  }

  revalidateApplicationRoutes();
  return { ok: true };
}

export async function deleteApplication(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id.trim()) {
    return;
  }

  const application = await prisma.bossContact.findUnique({
    where: { id },
    select: { sourceKey: true, companyName: true, jobTitle: true },
  });
  if (!application) {
    return;
  }

  // 记住被删除的岗位：之后的渠道同步会按 sourceKey 跳过它们，不再重新添加。
  await prisma.$transaction([
    prisma.dismissedApplication.upsert({
      where: { sourceKey: application.sourceKey },
      create: {
        sourceKey: application.sourceKey,
        companyName: application.companyName,
        jobTitle: application.jobTitle,
      },
      update: { dismissedAt: new Date() },
    }),
    prisma.bossContact.deleteMany({ where: { id } }),
  ]);

  revalidateApplicationRoutes();
}
