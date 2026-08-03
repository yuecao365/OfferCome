"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";

import type { ApplicationActionState } from "./action-state";
import { parseApplicationFormData } from "./form";

function revalidateApplicationRoutes() {
  revalidatePath("/");
  revalidatePath("/applications");
}

export async function createApplication(
  _prevState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const parsed = parseApplicationFormData(formData);
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
      return { status: "error", message: "这条投递记录已存在。" };
    }
    return { status: "error", message: "保存失败，请稍后重试。" };
  }

  revalidateApplicationRoutes();
  return { status: "success", message: "投递记录已创建。" };
}

export async function updateApplication(
  id: string,
  _prevState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const parsed = parseApplicationFormData(formData);
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
        appliedAt: parsed.value.appliedAt,
        stage: parsed.value.stage,
        note: parsed.value.note,
        autoRejectedAt: null,
        unchangedSince: new Date(),
      },
    });
  } catch {
    return { status: "error", message: "更新失败，请稍后重试。" };
  }

  revalidateApplicationRoutes();
  return { status: "success", message: "投递记录已更新。" };
}

export async function deleteApplication(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id.trim()) {
    return;
  }

  await prisma.bossContact.deleteMany({
    where: { id },
  });

  revalidateApplicationRoutes();
}
