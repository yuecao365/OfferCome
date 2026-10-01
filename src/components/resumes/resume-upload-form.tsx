"use client";

import { FileUp } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { RequiredMark } from "@/components/ui/form-controls";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import {
  confirmResumeExperiences,
  discardResumePreview,
  parseResumePreview,
} from "@/lib/resumes/actions";
import {
  initialResumeActionState,
  type ResumeActionState,
} from "@/lib/resumes/types";

import { ResumeExperienceConfirmationPanel } from "./resume-experience-confirmation-panel";
import { FileInput } from "@/components/ui/file-input";

const messages = defineMessages({
  "zh-CN": {
    parsing: "解析中...",
    submit: "上传并识别",
    chooseFile: "选择简历文件",
    formats: "支持 PDF、DOC、DOCX、JPG、PNG、WebP，单文件不超过 10MB。",
    setDefault: "设为默认简历",
    cancelNote: "取消或关闭弹窗不会创建正式简历记录。",
    fallbackFileName: "简历文件",
  },
  en: {
    parsing: "Parsing...",
    submit: "Upload and extract",
    chooseFile: "Choose a resume file",
    formats: "PDF, DOC, DOCX, JPG, PNG or WebP, up to 10MB.",
    setDefault: "Set as default resume",
    cancelNote: "Cancelling or closing this dialog won't create a resume record.",
    fallbackFileName: "Resume file",
  },
});

const RESUME_ACCEPT =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp";

type ResumeUploadFormProps = {
  onSaved?: () => void;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useMessages(messages);

  return (
    <Button disabled={pending} type="submit">
      {pending ? t.parsing : t.submit}
    </Button>
  );
}

function ResumeParseForm({
  state,
  formAction,
}: {
  state: ResumeActionState;
  formAction: (payload: FormData) => void;
}) {
  const t = useMessages(messages);
  return (
    <form action={formAction} className="grid gap-5">
      <div className="dot-grid rounded-panel border border-dashed border-border-strong p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileUp aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <label className="text-sm font-semibold text-foreground" htmlFor="resume">
              {t.chooseFile}
              <RequiredMark />
            </label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t.formats}
            </p>
          </div>
        </div>
        <FileInput
          accept={RESUME_ACCEPT}
          className="mt-5 rounded-lg border border-border-strong bg-surface px-3 py-2 shadow-card"
          id="resume"
          name="resume"
          required
        />
      </div>

      {state.message ? (
        <p
          aria-live="polite"
          className={[
            "text-sm",
            state.status === "error" ? "text-red-700" : "text-zinc-700",
          ].join(" ")}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            className="size-4 rounded border-border-strong accent-brand"
            name="isDefault"
            type="checkbox"
          />
          {t.setDefault}
        </label>
        <SubmitButton />
      </div>
    </form>
  );
}

export function ResumeUploadForm({ onSaved }: ResumeUploadFormProps) {
  const router = useRouter();
  const t = useMessages(messages);
  const [state, formAction] = useActionState<ResumeActionState, FormData>(
    parseResumePreview,
    initialResumeActionState,
  );

  if (state.status === "success" && state.tempUploadId) {
    const tempUploadId = state.tempUploadId;
    const isDefault = Boolean(state.isDefault);
    return (
      <ResumeExperienceConfirmationPanel
        cancelNote={t.cancelNote}
        existingProjects={state.existingProjects ?? []}
        extractionSource={state.extractionSource}
        fileName={state.fileName ?? t.fallbackFileName}
        key={tempUploadId}
        onCancel={() => discardResumePreview(tempUploadId)}
        onClose={onSaved}
        onConfirm={async (items) => {
          const result = await confirmResumeExperiences({
            tempUploadId,
            isDefault,
            items,
          });
          if (result.status === "success") router.refresh();
          return result;
        }}
        pendingExperiences={state.pendingExperiences ?? []}
      />
    );
  }

  return <ResumeParseForm formAction={formAction} state={state} />;
}
