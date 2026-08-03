"use client";

import type { ApplicationListItem } from "@/lib/applications/types";
import { buttonClassName } from "@/components/ui/button";

import { ApplicationForm } from "./application-form";
import { Modal } from "./modal";

export function NewApplicationModal() {
  return (
    <Modal
      title="新建投递"
      triggerClassName={buttonClassName()}
      triggerLabel="新建投递"
    >
      {(close) => (
        <ApplicationForm mode="create" onCancel={close} onSaved={close} />
      )}
    </Modal>
  );
}

export function EditApplicationModal({
  application,
}: {
  application: ApplicationListItem;
}) {
  return (
    <Modal title="编辑投递" triggerLabel="编辑">
      {(close) => (
        <ApplicationForm
          initial={application}
          mode="edit"
          onCancel={close}
          onSaved={close}
        />
      )}
    </Modal>
  );
}
