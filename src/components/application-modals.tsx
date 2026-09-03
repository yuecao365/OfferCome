"use client";

import { Pencil } from "lucide-react";
import type { ComponentProps } from "react";

import type { ApplicationListItem } from "@/lib/applications/types";
import { buttonClassName } from "@/components/ui/button";

import { ApplicationForm } from "./application-form";
import { Modal } from "./modal";

export function NewApplicationModal({
  action,
}: {
  /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
  action?: ComponentProps<typeof ApplicationForm>["action"];
} = {}) {
  return (
    <Modal
      title="新建投递"
      triggerClassName={buttonClassName()}
      triggerLabel="新建投递"
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
  return (
    <Modal
      title="编辑投递"
      triggerClassName={buttonClassName({ variant: "ghost", size: "icon-sm" })}
      triggerLabel={<Pencil aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
      triggerTitle="编辑投递"
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
