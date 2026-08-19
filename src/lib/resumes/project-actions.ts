"use server";

import { prisma } from "@/lib/db";
import { toMutationError, type MutationState } from "@/lib/mutation-state";

import { normalizeResumeExperienceFields } from "./confirmation";
import { revalidateResumeDependents } from "./revalidate";

/** Creates a manual internship/project when `id` is null, otherwise updates that record. */
export async function saveResumeProject(input: {
  id: string | null;
  name: string;
  type: string;
  organization: string | null;
  description: string | null;
}): Promise<MutationState> {
  try {
    const fields = normalizeResumeExperienceFields(input);

    if (input.id) {
      await prisma.resumeProject.update({
        where: { id: input.id },
        data: fields,
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
      message: input.id ? "已更新实习/项目。" : "已新增实习/项目。",
    };
  } catch (error) {
    return toMutationError(error, "实习/项目保存失败。");
  }
}

export async function deleteResumeProject(
  id: string,
): Promise<MutationState> {
  try {
    await prisma.resumeProject.delete({ where: { id } });
    revalidateResumeDependents();

    return { status: "success", message: "已删除实习/项目。" };
  } catch (error) {
    return toMutationError(error, "实习/项目删除失败。");
  }
}
