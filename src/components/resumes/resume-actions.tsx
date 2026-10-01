"use client";

import { CheckCircle2, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import {
  deleteResume,
  setDefaultResume,
} from "@/lib/resumes/actions";

const messages = defineMessages({
  "zh-CN": {
    pending: "处理中",
    delete: "删除",
    setDefault: "设为默认",
    deleteConfirm: "删除后将移除此简历文件及其与实习/项目的关联，但不会删除已保存的实习/项目记录。",
  },
  en: {
    pending: "Working",
    delete: "Delete",
    setDefault: "Set as default",
    deleteConfirm:
      "This removes the resume file and its links to internships/projects. Saved internship/project records are kept.",
  },
});

type ResumeActionsProps = {
  id: string;
  isDefault: boolean;
  /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
  setDefaultAction?: (formData: FormData) => Promise<void>;
  deleteAction?: (formData: FormData) => Promise<void>;
  /** 体验版的删除只清掉解析内容，提示语与本地版不同。 */
  deleteConfirmMessage?: string;
};

function ActionButton({
  action,
}: {
  action: "default" | "delete";
}) {
  const t = useMessages(messages);
  const { pending } = useFormStatus();
  const deleting = action === "delete";
  return (
    <Button
      className={deleting ? "text-danger hover:bg-danger-soft hover:text-danger-strong" : undefined}
      disabled={pending}
      size="sm"
      type="submit"
      variant="ghost"
    >
      {deleting ? (
        <Trash2 aria-hidden="true" className="size-3.5" />
      ) : (
        <CheckCircle2 aria-hidden="true" className="size-3.5" />
      )}
      {pending ? t.pending : deleting ? t.delete : t.setDefault}
    </Button>
  );
}

export function ResumeActions({
  id,
  isDefault,
  setDefaultAction,
  deleteAction,
  deleteConfirmMessage,
}: ResumeActionsProps) {
  const t = useMessages(messages);
  const confirmMessage = deleteConfirmMessage ?? t.deleteConfirm;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isDefault ? (
        <form action={setDefaultAction ?? setDefaultResume}>
          <input name="id" type="hidden" value={id} />
          <ActionButton action="default" />
        </form>
      ) : null}
      <form
        action={deleteAction ?? deleteResume}
        onSubmit={(event) => {
          if (!window.confirm(confirmMessage)) {
            event.preventDefault();
          }
        }}
      >
        <input name="id" type="hidden" value={id} />
        <ActionButton action="delete" />
      </form>
    </div>
  );
}
