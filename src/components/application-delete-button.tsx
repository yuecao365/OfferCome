"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { deleteApplication } from "@/lib/applications/actions";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    label: "删除投递记录",
    confirm: "确定删除这条投递记录吗？删除后无法恢复。",
  },
  en: {
    label: "Delete application",
    confirm: "Delete this application? This can't be undone.",
  },
});

function DeleteButton() {
  const { pending } = useFormStatus();
  const t = useMessages(messages);

  return (
    <Button
      aria-label={t.label}
      className="text-danger hover:bg-danger-soft hover:text-danger-strong"
      disabled={pending}
      size="icon-sm"
      title={t.label}
      type="submit"
      variant="ghost"
    >
      <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
    </Button>
  );
}

export function ApplicationDeleteButton({
  id,
  action,
}: {
  id: string;
  /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
  action?: (formData: FormData) => Promise<void>;
}) {
  const t = useMessages(messages);
  return (
    <form
      action={action ?? deleteApplication}
      onSubmit={(event) => {
        if (!window.confirm(t.confirm)) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={id} />
      <DeleteButton />
    </form>
  );
}
