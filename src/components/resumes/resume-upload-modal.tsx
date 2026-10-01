"use client";

import { Modal } from "@/components/modal";
import { buttonClassName } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

import { ResumeUploadForm } from "./resume-upload-form";

const messages = defineMessages({
  "zh-CN": { upload: "上传简历" },
  en: { upload: "Upload resume" },
});

export function ResumeUploadModal() {
  const t = useMessages(messages);
  return (
    <Modal
      size="compact"
      title={t.upload}
      triggerClassName={buttonClassName()}
      triggerLabel={t.upload}
    >
      {(close) => <ResumeUploadForm onSaved={close} />}
    </Modal>
  );
}
