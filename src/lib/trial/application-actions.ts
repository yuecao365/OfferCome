"use client";

import type { ApplicationActionState } from "@/lib/applications/action-state";
import { parseApplicationFormData } from "@/lib/applications/form";
import { isApplicationStage } from "@/lib/applications/types";

import {
  deleteApplication as deleteFromWorkspace,
  updateApplicationStage,
  upsertApplication,
} from "./workspace";
import { mutateWorkspace } from "./workspace-store";

/**
 * 体验版的投递动作：与 Server Action 同签名，写的是浏览器工作台。
 *
 * 表单校验复用本地版的 parseApplicationFormData（纯函数）——两个版本对
 * "什么算合法输入"永远一致，错误提示也一字不差。
 */

export async function createTrialApplication(
  _previous: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const parsed = parseApplicationFormData(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  mutateWorkspace((workspace) =>
    upsertApplication(workspace, {
      companyName: parsed.value.companyName,
      jobTitle: parsed.value.jobTitle,
      stage: parsed.value.stage,
      appliedAt: parsed.value.appliedAt,
      source: parsed.value.source,
      jobUrl: parsed.value.jobUrl,
      jobDescription: parsed.value.jobDescription ?? "",
      note: parsed.value.note ?? "",
    }),
  );
  return { status: "success", message: "投递记录已创建。" };
}

export async function updateTrialApplication(
  id: string,
  _previous: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const parsed = parseApplicationFormData(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  mutateWorkspace((workspace) =>
    upsertApplication(
      workspace,
      {
        companyName: parsed.value.companyName,
        jobTitle: parsed.value.jobTitle,
        stage: parsed.value.stage,
        appliedAt: parsed.value.appliedAt,
        source: parsed.value.source,
        jobUrl: parsed.value.jobUrl,
        jobDescription: parsed.value.jobDescription ?? "",
        note: parsed.value.note ?? "",
      },
      id,
    ),
  );
  return { status: "success", message: "投递记录已更新。" };
}

export async function deleteTrialApplication(id: string): Promise<void> {
  mutateWorkspace((workspace) => deleteFromWorkspace(workspace, id));
}

export async function updateTrialApplicationStage(
  id: string,
  stage: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!isApplicationStage(stage)) {
    return { ok: false, message: "无效的流程状态。" };
  }
  mutateWorkspace((workspace) => updateApplicationStage(workspace, id, stage));
  return { ok: true };
}
