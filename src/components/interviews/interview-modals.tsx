"use client";

import type { ComponentProps } from "react";

import { Modal } from "@/components/modal";
import { buttonClassName } from "@/components/ui/button";
import type {
  InterviewListItem,
  ResumeProjectOption,
} from "@/lib/interviews/types";

import { InterviewForm, type InterviewPrefill } from "./interview-form";

export function NewInterviewModal({
  resumeProjects,
  transcriptionConfigured,
  prefill,
  triggerLabel = "新建面试",
  triggerClassName,
  action,
  draftImportEnabled,
}: {
  resumeProjects: ResumeProjectOption[];
  transcriptionConfigured: boolean;
  prefill?: InterviewPrefill | null;
  triggerLabel?: string;
  triggerClassName?: string;
  /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
  action?: ComponentProps<typeof InterviewForm>["action"];
  draftImportEnabled?: boolean;
}) {
  return (
    <Modal
      size="extraWide"
      title="新增面试"
      triggerClassName={triggerClassName ?? buttonClassName()}
      triggerLabel={triggerLabel}
    >
      {(close) => (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            {prefill
              ? "已带入这条投递的公司与岗位。保存后投递阶段会自动推进到对应轮次。"
              : "可以先保存问题，回答后续再补充。实习/项目问题允许暂不关联具体条目。"}
          </p>
          <InterviewForm
            action={action}
            draftImportEnabled={draftImportEnabled}
            mode="create"
            onCancel={close}
            onSaved={close}
            prefill={prefill}
            resumeProjects={resumeProjects}
            transcriptionConfigured={transcriptionConfigured}
          />
        </div>
      )}
    </Modal>
  );
}

export function EditInterviewModal({
  interview,
  resumeProjects,
  action,
}: {
  interview: InterviewListItem;
  resumeProjects: ResumeProjectOption[];
  action?: ComponentProps<typeof InterviewForm>["action"];
}) {
  return (
    <Modal size="extraWide" title="编辑面试记录" triggerLabel="编辑">
      {(close) => (
        <InterviewForm
          action={action}
          initial={interview}
          mode="edit"
          onCancel={close}
          onSaved={close}
          resumeProjects={resumeProjects}
        />
      )}
    </Modal>
  );
}
