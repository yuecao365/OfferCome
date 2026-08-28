"use server";

import { prisma } from "@/lib/db";
import { isTrialMode } from "@/lib/runtime-mode";

import {
  buildPendingResumeExperienceConfirmations,
  resolveResumeExperienceConfirmations,
  resumeExperienceTypeLabel,
  type ExistingResumeProjectOption,
  type ResumeExperienceConfirmationInput,
} from "./confirmation";
import {
  extractResumeExperiencesFromText,
  extractResumeTextFromFile,
  type ExtractedResumeExperience,
} from "./extract";
import { revalidateResumeDependents } from "./revalidate";
import {
  deleteStoredResumeFile,
  discardTemporaryResumeFile,
  promoteTemporaryResumeFile,
  saveTemporaryResumeFile,
} from "./storage";
import type {
  ResumeActionState,
  ResumeExperienceConfirmState,
} from "./types";

function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function logExtractedResumeExperiences(
  originalName: string,
  experiences: ExtractedResumeExperience[],
): void {
  console.log(
    `[resumes] extracted ${experiences.length} experience(s) from ${originalName}`,
  );

  if (experiences.length === 0) {
    console.log("[resumes] no internship/project items recognized");
    return;
  }

  for (const experience of experiences) {
    const value =
      experience.type === "internship"
        ? experience.organization?.trim() || experience.title.trim()
        : experience.title.trim();
    console.log(`[resumes] ${resumeExperienceTypeLabel(experience.type)}+${value}`);
  }
}

async function getExistingResumeProjectOptions(): Promise<
  ExistingResumeProjectOption[]
> {
  return prisma.resumeProject.findMany({
    orderBy: [{ type: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      organization: true,
    },
  });
}

export async function parseResumePreview(
  _prevState: ResumeActionState,
  formData: FormData,
): Promise<ResumeActionState> {
  // 这条路径会把上传的文件落到服务器磁盘，和体验模式"只存文本、不留文件"
  // 的承诺冲突。体验模式有自己的入口（/api/trial/resume 内存解析）。
  // 挡在这里而不是 proxy：Server Action 都发往页面路径，按路径分不出来。
  if (isTrialMode()) {
    return {
      status: "error",
      message:
        "体验模式不保存简历文件。请到「体验 AI 模拟面试」页面上传解析或手动填写简历内容。",
    };
  }

  const file = formData.get("resume");
  if (!(file instanceof File) || !file.name) {
    return { status: "error", message: "请选择要上传的简历文件。" };
  }

  try {
    const temporary = await saveTemporaryResumeFile(file);
    const isDefault = getString(formData, "isDefault") === "on";

    let experiences: ExtractedResumeExperience[] = [];
    try {
      const resumeText = await extractResumeTextFromFile(
        temporary.filePath,
        temporary.mimeType,
      );
      console.log(`[resumes] extracted text length=${resumeText.length}`);
      experiences = extractResumeExperiencesFromText(resumeText);
      logExtractedResumeExperiences(temporary.originalName, experiences);
    } catch (error) {
      console.warn(
        "[resumes] resume experience extraction failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    }

    const existingProjects = await getExistingResumeProjectOptions();
    const pendingExperiences = buildPendingResumeExperienceConfirmations(
      experiences,
      existingProjects,
    );

    return {
      status: "success",
      message:
        pendingExperiences.length > 0
          ? `已识别到 ${pendingExperiences.length} 条实习/项目，请确认后保存。`
          : "未自动识别到实习或项目。确认后仍会保存简历。",
      tempUploadId: temporary.tempUploadId,
      fileName: temporary.originalName,
      isDefault,
      pendingExperiences,
      existingProjects,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "简历解析失败。",
    };
  }
}

export async function confirmResumeExperiences(input: {
  tempUploadId: string;
  isDefault: boolean;
  items: ResumeExperienceConfirmationInput[];
}): Promise<ResumeExperienceConfirmState> {
  let stored:
    | Awaited<ReturnType<typeof promoteTemporaryResumeFile>>
    | null = null;

  try {
    const existingProjects = await getExistingResumeProjectOptions();
    const resolved = resolveResumeExperienceConfirmations(
      input.items,
      existingProjects,
    );
    stored = await promoteTemporaryResumeFile(input.tempUploadId);
    const storedResume = stored;

    const result = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.resume.count();
      const shouldBeDefault = existingCount === 0 || input.isDefault;
      const resume = await tx.resume.create({
        data: { ...storedResume, isDefault: shouldBeDefault },
        select: { id: true },
      });

      if (shouldBeDefault) {
        await tx.resume.updateMany({
          where: { id: { not: resume.id } },
          data: { isDefault: false },
        });
      }

      for (const item of resolved.creates) {
        const project = await tx.resumeProject.create({
          data: {
            resumeId: resume.id,
            name: item.name,
            type: item.type,
            organization: item.organization,
            description: item.description,
            startDate: item.startDate,
            endDate: item.endDate,
            sourceText: item.sourceText,
            sortOrder: item.sortOrder,
          },
          select: { id: true },
        });

        await tx.resumeProjectSource.create({
          data: {
            resumeId: resume.id,
            resumeProjectId: project.id,
            extractedName: item.extractedName,
            finalName: item.finalName,
            sourceText: item.sourceText,
          },
        });
      }

      for (const item of resolved.links) {
        await tx.resumeProjectSource.create({
          data: {
            resumeId: resume.id,
            resumeProjectId: item.resumeProjectId,
            extractedName: item.extractedName,
            finalName: item.finalName,
            sourceText: item.sourceText,
          },
        });
      }

      return {
        resumeId: resume.id,
        createdCount: resolved.creates.length,
        linkedCount: resolved.links.length,
      };
    });

    revalidateResumeDependents();

    return {
      status: "success",
      message: `已保存简历，新增 ${result.createdCount} 条实习/项目，关联 ${result.linkedCount} 条已有实习/项目。`,
      resumeId: result.resumeId,
      createdCount: result.createdCount,
      linkedCount: result.linkedCount,
    };
  } catch (error) {
    if (stored) {
      await deleteStoredResumeFile(stored.filePath).catch(() => undefined);
    }

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "实习/项目确认保存失败。",
      createdCount: 0,
      linkedCount: 0,
    };
  }
}

export async function discardResumePreview(tempUploadId: string): Promise<void> {
  await discardTemporaryResumeFile(tempUploadId);
}

export async function deleteResume(formData: FormData): Promise<void> {
  const id = getString(formData, "id");
  if (!id) {
    return;
  }

  const resume = await prisma.resume.findUnique({
    where: { id },
    select: { id: true, filePath: true, isDefault: true },
  });
  if (!resume) {
    return;
  }

  await prisma.$transaction([
    prisma.resumeProjectSource.deleteMany({ where: { resumeId: id } }),
    prisma.resumeProject.updateMany({
      where: { resumeId: id },
      data: { resumeId: null },
    }),
    prisma.resume.delete({ where: { id } }),
  ]);
  await deleteStoredResumeFile(resume.filePath);

  if (resume.isDefault) {
    const nextDefault = await prisma.resume.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (nextDefault) {
      await prisma.resume.update({
        where: { id: nextDefault.id },
        data: { isDefault: true },
      });
    }
  }

  revalidateResumeDependents();
}

export async function setDefaultResume(formData: FormData): Promise<void> {
  const id = getString(formData, "id");
  if (!id) {
    return;
  }

  await prisma.$transaction([
    prisma.resume.updateMany({ data: { isDefault: false } }),
    prisma.resume.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidateResumeDependents();
}
