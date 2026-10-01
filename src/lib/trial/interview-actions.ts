"use client";

import {
  parseInterviewFormData,
  type InterviewActionState,
} from "@/lib/interviews/types";
import { browserLocale, browserMessages } from "@/lib/i18n/browser";
import { defineMessages } from "@/lib/i18n/locale";

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

const messages = defineMessages({
  "zh-CN": { saved: "面试记录已保存。", updated: "面试记录已更新。" },
  en: { saved: "Interview saved.", updated: "Interview updated." },
});

export async function createTrialInterviewRecord(
  _previous: InterviewActionState,
  formData: FormData,
): Promise<InterviewActionState> {
  const parsed = parseInterviewFormData(formData, browserLocale());
  if (!parsed.ok) return { status: "error", message: parsed.message };

  mutateWorkspace((workspace) => upsertInterview(workspace, parsed.value));
  return { status: "success", message: browserMessages(messages).saved };
}

export async function updateTrialInterviewRecord(
  id: string,
  _previous: InterviewActionState,
  formData: FormData,
): Promise<InterviewActionState> {
  const parsed = parseInterviewFormData(formData, browserLocale());
  if (!parsed.ok) return { status: "error", message: parsed.message };

  mutateWorkspace((workspace) => upsertInterview(workspace, parsed.value, id));
  return { status: "success", message: browserMessages(messages).updated };
}

export async function deleteTrialInterviewRecord(id: string): Promise<void> {
  mutateWorkspace((workspace) => deleteFromWorkspace(workspace, id));
}
