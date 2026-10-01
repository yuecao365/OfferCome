"use server";

import { prisma } from "@/lib/db";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";

import {
  buildPendingResumeExperienceConfirmations,
  resolveResumeExperienceConfirmations,
  type ResumeExperienceConfirmationInput,
} from "./confirmation";
import { extractResumeExperiences } from "./experience-agent";
import {
  getExistingResumeProjectOptions,
  persistResumeExperiences,
} from "./experience-store";
import { extractResumeTextFromFile } from "./extract";
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

const messages = defineMessages({
  "zh-CN": {
    noFile: "请选择要上传的简历文件。",
    found: (count: number) => `已识别到 ${count} 条实习/项目，请确认后保存。`,
    noneFound: "未自动识别到实习或项目。确认后仍会保存简历。",
    parseFailed: "简历解析失败。",
    saved: (created: number, linked: number) =>
      `已保存简历，新增 ${created} 条实习/项目，关联 ${linked} 条已有实习/项目。`,
    confirmFailed: "实习/项目确认保存失败。",
  },
  en: {
    noFile: "Choose a resume file to upload.",
    found: (count: number) =>
      `Found ${count} ${count === 1 ? "internship/project" : "internships/projects"}. Review them, then save.`,
    noneFound: "No internships or projects were detected. The resume will still be saved when you confirm.",
    parseFailed: "Couldn't parse the resume.",
    saved: (created: number, linked: number) =>
      `Resume saved: ${created} new internships/projects added, ${linked} linked to existing ones.`,
    confirmFailed: "Couldn't save the confirmed internships/projects.",
  },
});

function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function parseResumePreview(
  _prevState: ResumeActionState,
  formData: FormData,
): Promise<ResumeActionState> {
  const locale = await getLocale();
  const t = messages[locale];
  const file = formData.get("resume");
  if (!(file instanceof File) || !file.name) {
    return { status: "error", message: t.noFile };
  }

  try {
    const temporary = await saveTemporaryResumeFile(file, locale);
    const isDefault = getString(formData, "isDefault") === "on";

    let extraction: Awaited<ReturnType<typeof extractResumeExperiences>> = {
      experiences: [],
      source: "rules",
    };
    try {
      const resumeText = await extractResumeTextFromFile(
        temporary.filePath,
        temporary.mimeType,
      );
      extraction = await extractResumeExperiences(resumeText);
      console.log(
        `[resumes] ${temporary.originalName}: text=${resumeText.length} chars, ${extraction.experiences.length} experience(s) via ${extraction.source}`,
      );
    } catch (error) {
      console.warn(
        "[resumes] resume experience extraction failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    }

    const existingProjects = await getExistingResumeProjectOptions();
    const pendingExperiences = buildPendingResumeExperienceConfirmations(
      extraction.experiences,
      existingProjects,
    );

    return {
      status: "success",
      message:
        pendingExperiences.length > 0
          ? t.found(pendingExperiences.length)
          : t.noneFound,
      tempUploadId: temporary.tempUploadId,
      fileName: temporary.originalName,
      isDefault,
      pendingExperiences,
      existingProjects,
      extractionSource: extraction.source,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : t.parseFailed,
    };
  }
}

export async function confirmResumeExperiences(input: {
  tempUploadId: string;
  isDefault: boolean;
  items: ResumeExperienceConfirmationInput[];
}): Promise<ResumeExperienceConfirmState> {
  const locale = await getLocale();
  const t = messages[locale];
  let stored:
    | Awaited<ReturnType<typeof promoteTemporaryResumeFile>>
    | null = null;

  try {
    const existingProjects = await getExistingResumeProjectOptions();
    const resolved = resolveResumeExperienceConfirmations(
      input.items,
      existingProjects,
      locale,
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

      const persisted = await persistResumeExperiences(tx, {
        resumeId: resume.id,
        resolved,
      });

      return { resumeId: resume.id, ...persisted };
    });

    revalidateResumeDependents();

    return {
      status: "success",
      message: t.saved(result.createdCount, result.linkedCount),
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
        error instanceof Error ? error.message : t.confirmFailed,
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
