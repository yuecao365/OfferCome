"use server";

import { prisma } from "@/lib/db";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { toMutationError, type MutationState } from "@/lib/mutation-state";

import { normalizeResumeExperienceFields } from "./confirmation";
import { revalidateResumeDependents } from "./revalidate";

const messages = defineMessages({
  "zh-CN": {
    updated: "已更新实习/项目。",
    created: "已新增实习/项目。",
    saveFailed: "实习/项目保存失败。",
    deleted: "已删除实习/项目。",
    deleteFailed: "实习/项目删除失败。",
  },
  en: {
    updated: "Internship/project updated.",
    created: "Internship/project added.",
    saveFailed: "Couldn't save the internship/project.",
    deleted: "Internship/project deleted.",
    deleteFailed: "Couldn't delete the internship/project.",
  },
});

/** Creates a manual internship/project when `id` is null, otherwise updates that record. */
export async function saveResumeProject(input: {
  id: string | null;
  name: string;
  type: string;
  organization: string | null;
  description: string | null;
}): Promise<MutationState> {
  const locale = await getLocale();
  const t = messages[locale];
  try {
    const fields = normalizeResumeExperienceFields(input, locale);

    if (input.id) {
      // 用户亲手改过，就不再是"自动识别、未确认"的条目。
      await prisma.resumeProject.update({
        where: { id: input.id },
        data: { ...fields, autoExtractedAt: null },
      });
    } else {
      const { _max } = await prisma.resumeProject.aggregate({
        _max: { sortOrder: true },
      });
      await prisma.resumeProject.create({
        data: { ...fields, sortOrder: (_max.sortOrder ?? -1) + 1 },
      });
    }

    revalidateResumeDependents();

    return {
      status: "success",
      message: input.id ? t.updated : t.created,
    };
  } catch (error) {
    return toMutationError(error, t.saveFailed);
  }
}

export async function deleteResumeProject(
  id: string,
): Promise<MutationState> {
  const locale = await getLocale();
  const t = messages[locale];
  try {
    await prisma.resumeProject.delete({ where: { id } });
    revalidateResumeDependents();

    return { status: "success", message: t.deleted };
  } catch (error) {
    return toMutationError(error, t.deleteFailed);
  }
}
