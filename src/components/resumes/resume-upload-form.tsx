"use client";

import { FileUp } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  confirmResumeExperiences,
  discardResumePreview,
  parseResumePreview,
} from "@/lib/resumes/actions";
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

  function updateItem(
    clientId: string,
    updates: Partial<
      Pick<DraftItem, "finalName" | "selectedExistingItemId" | "type">
    >,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.clientId === clientId ? { ...item, ...updates } : item,
      ),
    );
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
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold text-zinc-950">
          已识别到简历中的实习/项目，请确认后保存。
        </h3>
        <p className="text-xs text-zinc-600">
          来源简历：{fileName}。取消或关闭弹窗不会创建正式简历记录。
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600">
          未识别到实习或项目。你仍然可以确认保存简历，或取消本次上传。
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <div
              className="grid gap-3 rounded border border-zinc-200 bg-white p-3"
              key={item.clientId}
            >
              <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-800">类型</span>
                  <select
                    className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm"
                    onChange={(event) =>
                      updateItem(item.clientId, {
                        type:
                          event.target.value === "internship"
                            ? "internship"
                            : "project",
                      })
                    }
                    value={item.type}
                  >
                    <option value="internship">实习</option>
                    <option value="project">项目</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-800">名称</span>
                  <input
                    className="rounded border border-zinc-300 px-3 py-2 text-sm"
                    onChange={(event) =>
                      updateItem(item.clientId, {
                        finalName: event.target.value,
                      })
                    }
                    required
                    value={item.finalName}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-zinc-800">
                  关联已有实习/项目
                </span>
                <select
                  className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm"
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
                </select>
              </label>
              <dl className="grid gap-1 text-xs text-zinc-500">
                <div>
                  <dt className="inline font-medium">原始识别名称：</dt>
                  <dd className="inline">{item.extractedName}</dd>
                </div>
                {item.recommendedExistingItemId ? (
                  <div>
                    <dt className="inline font-medium">系统预选：</dt>
                    <dd className="inline">
                      已根据名称相似度预选已有记录
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ))}
        </div>
      )}

      {confirmState.message ? (
        <p
          aria-live="polite"
          className={[
            "text-sm",
            confirmState.status === "error" ? "text-red-700" : "text-zinc-700",
          ].join(" ")}
        >
          {confirmState.message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
          disabled={isPending}
          onClick={handleCancel}
          type="button"
        >
          取消
        </button>
        <button
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={isPending}
          onClick={handleConfirm}
          type="button"
        >
          {isPending ? "保存中..." : "确认保存"}
        </button>
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
      <div className="rounded-xl border border-dashed border-border-strong bg-surface-subtle p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileUp aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <label className="text-sm font-semibold text-foreground" htmlFor="resume">
              选择简历文件
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
