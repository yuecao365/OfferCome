"use client";

import { Modal } from "@/components/modal";
import { buttonClassName } from "@/components/ui/button";

import { ResumeUploadForm } from "./resume-upload-form";

export function ResumeUploadModal() {
  return (
    <Modal
      size="compact"
      title="上传简历"
      triggerClassName={buttonClassName()}
      triggerLabel="上传简历"
    >
      {(close) => <ResumeUploadForm onSaved={close} />}
    </Modal>
  );
}
