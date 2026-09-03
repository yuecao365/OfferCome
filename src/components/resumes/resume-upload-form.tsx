"use client";

import { FileUp } from "lucide-react";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FieldLabel, RequiredMark, Select } from "@/components/ui/form-controls";
import {
  confirmResumeExperiences,
  discardResumePreview,
  parseResumePreview,
} from "@/lib/resumes/actions";
import { createPendingResumeExperience } from "@/lib/resumes/confirmation";
import type {
  ExistingResumeProjectOption,
  PendingResumeExperienceConfirmation,
  ResumeExperienceConfirmationInput,
} from "@/lib/resumes/confirmation";

import {
  initialResumeActionState,
  type ResumeActionState,
  type ResumeExperienceConfirmState,
} from "@/lib/resumes/types";

import {
  ResumeExperienceFields,
  type ResumeExperienceFieldsValue,
} from "./resume-experience-fields";

const RESUME_ACCEPT =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp";

type DraftItem = PendingResumeExperienceConfirmation;

type ResumeUploadFormProps = {
  onSaved?: () => void;
};

const initialConfirmState: ResumeExperienceConfirmState = {
  status: "idle",
  message: "",
  createdCount: 0,
  linkedCount: 0,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? "解析中..." : "上传并识别"}
    </Button>
  );
}

function optionLabel(option: ExistingResumeProjectOption): string {
  const typeLabel = option.type === "internship" ? "实习" : "项目";
  return `${typeLabel} · ${option.name}${
    option.organization ? ` · ${option.organization}` : ""
  }`;
}

function ResumeExperienceConfirmationPanel({
  tempUploadId,
  fileName,
  isDefault,
  pendingExperiences,
  existingProjects,
  onClose,
}: {
  tempUploadId: string;
  fileName: string;
  isDefault: boolean;
  pendingExperiences: PendingResumeExperienceConfirmation[];
  existingProjects: ExistingResumeProjectOption[];
  onClose?: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<DraftItem[]>(pendingExperiences);
  const [confirmState, setConfirmState] =
    useState<ResumeExperienceConfirmState>(initialConfirmState);
  const [isPending, startTransition] = useTransition();
  const nextManualId = useRef(0);
  const hasBlankName = items.some((item) => !item.finalName.trim());

  function updateItem(clientId: string, updates: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item) =>
        item.clientId === clientId ? { ...item, ...updates } : item,
      ),
    );
  }

  function updateFields(
    clientId: string,
    patch: Partial<ResumeExperienceFieldsValue>,
  ) {
    const { name, ...rest } = patch;
    updateItem(clientId, {
      ...rest,
      ...(name === undefined ? {} : { finalName: name }),
    });
  }

  function removeItem(clientId: string) {
    setItems((current) => current.filter((item) => item.clientId !== clientId));
  }

  function addItem() {
    setItems((current) => [
      ...current,
      createPendingResumeExperience({
        clientId: `manual-experience-${nextManualId.current++}`,
        sortOrder:
          current.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
      }),
    ]);
  }

  function toConfirmationInput(
    item: DraftItem,
  ): ResumeExperienceConfirmationInput {
    return {
      clientId: item.clientId,
      type: item.type,
      extractedName: item.extractedName,
      finalName: item.finalName,
      existingItemId: item.selectedExistingItemId,
      organization: item.organization,
      description: item.description,
      startDate: item.startDate,
      endDate: item.endDate,
      sourceText: item.sourceText,
      sortOrder: item.sortOrder,
    };
  }

  function sortedOptionsFor(item: DraftItem): ExistingResumeProjectOption[] {
    return [...existingProjects].sort((left, right) => {
      const leftSameType = left.type === item.type ? 0 : 1;
      const rightSameType = right.type === item.type ? 0 : 1;
      return leftSameType - rightSameType || left.name.localeCompare(right.name);
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmResumeExperiences({
        tempUploadId,
        isDefault,
        items: items.map(toConfirmationInput),
      });
      setConfirmState(result);

      if (result.status === "success") {
        router.refresh();
        onClose?.();
      }
    });
  }

  function handleCancel() {
    startTransition(async () => {
      await discardResumePreview(tempUploadId);
      onClose?.();
    });
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold text-foreground">
            确认简历中的实习/项目，可修改、删除或手动补充。
          </h3>
          <p className="text-xs text-muted-foreground">
            来源简历：{fileName}。取消或关闭弹窗不会创建正式简历记录。
          </p>
        </div>
        <Button
          disabled={isPending}
          onClick={addItem}
          size="sm"
          type="button"
          variant="outline"
        >
          添加实习/项目
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-subtle p-4 text-sm text-muted-foreground">
          未识别到实习或项目。可以点击「添加实习/项目」手动补充，也可以直接确认只保存简历文件。
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item, index) => (
            <div
              className="grid gap-3 rounded-lg border border-border bg-surface p-3"
              key={item.clientId}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {item.extractedName ? `识别项 ${index + 1}` : `手动添加 ${index + 1}`}
                </p>
                <Button
                  disabled={isPending}
                  onClick={() => removeItem(item.clientId)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  删除
                </Button>
              </div>
              <ResumeExperienceFields
                disabled={isPending}
                label={`实习/项目 ${index + 1}`}
                onChange={(patch) => updateFields(item.clientId, patch)}
                value={{
                  type: item.type,
                  name: item.finalName,
                  organization: item.organization,
                  description: item.description,
                }}
              />
              <FieldLabel>
                关联已有实习/项目
                <Select
                  disabled={isPending}
                  onChange={(event) =>
                    updateItem(item.clientId, {
                      selectedExistingItemId: event.target.value || null,
                    })
                  }
                  value={item.selectedExistingItemId ?? ""}
                >
                  <option value="">新实习/项目</option>
                  {sortedOptionsFor(item).map((option) => (
                    <option key={option.id} value={option.id}>
                      {optionLabel(option)}
                    </option>
                  ))}
                </Select>
              </FieldLabel>
              {item.extractedName ? (
                <p className="text-xs text-muted-foreground">
                  原始识别名称：{item.extractedName}
                  {item.recommendedExistingItemId
                    ? " · 已根据名称相似度预选已有记录"
                    : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {confirmState.message ? (
        <p
          aria-live="polite"
          className={[
            "text-sm",
            confirmState.status === "error"
              ? "text-danger"
              : "text-muted-foreground",
          ].join(" ")}
        >
          {confirmState.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {hasBlankName ? (
          <p className="mr-auto text-xs text-danger">
            请为每条实习/项目填写名称，或删除多余的条目。
          </p>
        ) : null}
        <Button disabled={isPending} onClick={handleCancel} variant="outline">
          取消
        </Button>
        <Button disabled={isPending || hasBlankName} onClick={handleConfirm}>
          {isPending ? "保存中..." : "确认保存"}
        </Button>
      </div>
    </section>
  );
}

function ResumeParseForm({
  state,
  formAction,
}: {
  state: ResumeActionState;
  formAction: (payload: FormData) => void;
}) {
  return (
    <form action={formAction} className="grid gap-5">
      <div className="dot-grid rounded-panel border border-dashed border-border-strong p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileUp aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <label className="text-sm font-semibold text-foreground" htmlFor="resume">
              选择简历文件
              <RequiredMark />
            </label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              支持 PDF、DOC、DOCX、JPG、PNG、WebP，单文件不超过 10MB。
            </p>
          </div>
        </div>
        <input
          accept={RESUME_ACCEPT}
          className="mt-5 block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-card file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-accent-foreground hover:file:bg-accent-strong"
          id="resume"
          name="resume"
          required
          type="file"
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
          设为默认简历
        </label>
        <SubmitButton />
      </div>
    </form>
  );
}

export function ResumeUploadForm({ onSaved }: ResumeUploadFormProps) {
  const [state, formAction] = useActionState<ResumeActionState, FormData>(
    parseResumePreview,
    initialResumeActionState,
  );
  const existingProjects = useMemo(
    () => state.existingProjects ?? [],
    [state.existingProjects],
  );

  if (state.status === "success" && state.tempUploadId) {
    return (
      <ResumeExperienceConfirmationPanel
        existingProjects={existingProjects}
        fileName={state.fileName ?? "简历文件"}
        isDefault={Boolean(state.isDefault)}
        key={state.tempUploadId}
        onClose={onSaved}
        pendingExperiences={state.pendingExperiences ?? []}
        tempUploadId={state.tempUploadId}
      />
    );
  }

  return <ResumeParseForm formAction={formAction} state={state} />;
}
