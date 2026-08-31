"use client";

import {
  parseInterviewFormData,
  type InterviewActionState,
} from "@/lib/interviews/types";

import {
  deleteInterview as deleteFromWorkspace,
  upsertInterview,
} from "./workspace-interviews";
import { mutateWorkspace } from "./workspace-store";

/**
 * 体验版的面试记录动作：与 Server Action 同签名，写的是浏览器工作台。
 * 表单校验复用本地版的 parseInterviewFormData（纯函数），
 * 两个版本对"什么算合法输入"永远一致。
 */

export async function createTrialInterviewRecord(
  _previous: InterviewActionState,
  formData: FormData,
): Promise<InterviewActionState> {
  const parsed = parseInterviewFormData(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  mutateWorkspace((workspace) => upsertInterview(workspace, parsed.value));
  return { status: "success", message: "面试记录已保存。" };
}

export async function updateTrialInterviewRecord(
  id: string,
  _previous: InterviewActionState,
  formData: FormData,
): Promise<InterviewActionState> {
  const parsed = parseInterviewFormData(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  mutateWorkspace((workspace) => upsertInterview(workspace, parsed.value, id));
  return { status: "success", message: "面试记录已更新。" };
}

export async function deleteTrialInterviewRecord(id: string): Promise<void> {
  mutateWorkspace((workspace) => deleteFromWorkspace(workspace, id));
}
