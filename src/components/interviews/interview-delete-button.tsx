"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { deleteInterview } from "@/lib/interviews/actions";

const messages = defineMessages({
  "zh-CN": {
    delete: "删除面试记录",
    confirm: "确定删除这条面试记录吗？",
  },
  en: {
    delete: "Delete interview record",
    confirm: "Delete this interview record?",
  },
});

function DeleteButton() {
  const { pending } = useFormStatus();
  const t = useMessages(messages);
  return (
    <Button
      aria-label={t.delete}
      className="text-danger hover:bg-danger-soft hover:text-danger-strong"
      disabled={pending}
      size="icon-sm"
      title={t.delete}
      type="submit"
      variant="ghost"
    >
      <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
    </Button>
  );
}

export function InterviewDeleteButton({
  id,
  confirmMessage,
  redirectTo,
  action,
}: {
  id: string;
  confirmMessage?: string;
  redirectTo?: "/interviews/mock";
  /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
  action?: (formData: FormData) => Promise<void>;
}) {
  const t = useMessages(messages);
  return (
    <form
      action={action ?? deleteInterview}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage ?? t.confirm)) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={id} />
      {redirectTo ? (
        <input name="redirectTo" type="hidden" value={redirectTo} />
      ) : null}
      <DeleteButton />
    </form>
  );
}
