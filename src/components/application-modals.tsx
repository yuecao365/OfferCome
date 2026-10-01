"use client";

import { Pencil } from "lucide-react";
import type { ComponentProps } from "react";

import type { ApplicationListItem } from "@/lib/applications/types";
import { buttonClassName } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": { create: "新建投递", edit: "编辑投递" },
  en: { create: "New application", edit: "Edit application" },
});

import { ApplicationForm } from "./application-form";
import { Modal } from "./modal";

export function NewApplicationModal({
  action,
}: {
  /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
  action?: ComponentProps<typeof ApplicationForm>["action"];
} = {}) {
  const t = useMessages(messages);
  return (
    <Modal
      title={t.create}
      triggerClassName={buttonClassName()}
      triggerLabel={t.create}
    >
      {(close) => (
        <ApplicationForm action={action} mode="create" onCancel={close} onSaved={close} />
      )}
    </Modal>
  );
}

export function EditApplicationModal({
  application,
  action,
}: {
  application: ApplicationListItem;
  action?: ComponentProps<typeof ApplicationForm>["action"];
}) {
  const t = useMessages(messages);
  return (
    <Modal
      title={t.edit}
      triggerClassName={buttonClassName({ variant: "ghost", size: "icon-sm" })}
      triggerLabel={<Pencil aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
      triggerTitle={t.edit}
    >
      {(close) => (
        <ApplicationForm
          action={action}
          initial={application}
          mode="edit"
          onCancel={close}
          onSaved={close}
        />
      )}
    </Modal>
  );
}
