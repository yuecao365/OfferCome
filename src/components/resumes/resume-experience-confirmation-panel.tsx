"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldLabel, Select } from "@/components/ui/form-controls";
import { useLocale } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import {
  createPendingResumeExperience,
  RESUME_EXPERIENCE_TYPE_LABELS_I18N,
  resumeExtractionSourceNote,
  toResumeExperienceConfirmationInput,
  type ExistingResumeProjectOption,
  type PendingResumeExperienceConfirmation,
  type ResumeExperienceConfirmationInput,
  type ResumeExperienceExtractionSource,
} from "@/lib/resumes/confirmation";
import type { ResumeExperienceConfirmState } from "@/lib/resumes/types";

import {
  ResumeExperienceFields,
  type ResumeExperienceFieldsValue,
} from "./resume-experience-fields";

const messages = defineMessages({
  "zh-CN": {
    heading: "确认简历中的实习/项目，可修改、删除或手动补充。",
    source: (fileName: string, cancelNote: string) => `来源简历：${fileName}。${cancelNote}`,
    add: "添加实习/项目",
    empty: "未识别到实习或项目。可以点击「添加实习/项目」手动补充，也可以直接确认只保存简历。",
    extractedItem: (n: number) => `识别项 ${n}`,
    manualItem: (n: number) => `手动添加 ${n}`,
    delete: "删除",
    fieldsLabel: (n: number) => `实习/项目 ${n}`,
    linkExisting: "关联已有实习/项目",
    newItem: "新实习/项目",
    extractedName: (name: string) => `原始识别名称：${name}`,
    preselected: " · 已根据名称相似度预选已有记录",
    blankName: "请为每条实习/项目填写名称，或删除多余的条目。",
    cancel: "取消",
    saving: "保存中...",
    confirm: "确认保存",
  },
  en: {
    heading: "Review the internships/projects found in your resume. Edit, delete or add more.",
    source: (fileName: string, cancelNote: string) => `Source resume: ${fileName}. ${cancelNote}`,
    add: "Add internship/project",
    empty: "No internships or projects were found. Click \"Add internship/project\" to add them by hand, or confirm to save just the resume.",
    extractedItem: (n: number) => `Detected item ${n}`,
    manualItem: (n: number) => `Added by hand ${n}`,
    delete: "Delete",
    fieldsLabel: (n: number) => `Internship/project ${n}`,
    linkExisting: "Link to existing internship/project",
    newItem: "New internship/project",
    extractedName: (name: string) => `Originally detected as: ${name}`,
    preselected: " · Matching record preselected by name similarity",
    blankName: "Give every internship/project a name, or delete the extra entries.",
    cancel: "Cancel",
    saving: "Saving...",
    confirm: "Confirm and save",
  },
});

/**
 * 上传简历后的实习/项目确认面板。本地版和网页版渲染同一棵树，
 * 只有"确认"和"取消"两个动作由调用方注入：本地版写数据库，
 * 网页版写浏览器工作台。
 */

export type ResumeExperienceConfirmationPanelProps = {
  fileName: string;
  pendingExperiences: PendingResumeExperienceConfirmation[];
  existingProjects: ExistingResumeProjectOption[];
  extractionSource?: ResumeExperienceExtractionSource;
  /** 取消时的提示：说明取消对已有数据没有影响。 */
  cancelNote: string;
  onConfirm: (
    items: ResumeExperienceConfirmationInput[],
  ) => Promise<ResumeExperienceConfirmState>;
  onCancel: () => Promise<void> | void;
  /** 确认成功或取消后关闭所在弹窗。 */
  onClose?: () => void;
};

const initialConfirmState: ResumeExperienceConfirmState = {
  status: "idle",
  message: "",
  createdCount: 0,
  linkedCount: 0,
};

function optionLabel(option: ExistingResumeProjectOption, typeLabels: Record<"internship" | "project", string>): string {
  const typeLabel = option.type === "internship" ? typeLabels.internship : typeLabels.project;
  return `${typeLabel} · ${option.name}${
    option.organization ? ` · ${option.organization}` : ""
  }`;
}

export function ResumeExperienceConfirmationPanel({
  fileName,
  pendingExperiences,
  existingProjects,
  extractionSource,
  cancelNote,
  onConfirm,
  onCancel,
  onClose,
}: ResumeExperienceConfirmationPanelProps) {
  const [items, setItems] =
    useState<PendingResumeExperienceConfirmation[]>(pendingExperiences);
  const [confirmState, setConfirmState] =
    useState<ResumeExperienceConfirmState>(initialConfirmState);
  const [isPending, startTransition] = useTransition();
  const nextManualId = useRef(0);
  const hasBlankName = items.some((item) => !item.finalName.trim());
  const locale = useLocale();
  const t = messages[locale];
  const typeLabels = RESUME_EXPERIENCE_TYPE_LABELS_I18N[locale];
  const sourceNote = resumeExtractionSourceNote(extractionSource, locale);

  function updateItem(
    clientId: string,
    updates: Partial<PendingResumeExperienceConfirmation>,
  ) {
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

  function sortedOptionsFor(
    item: PendingResumeExperienceConfirmation,
  ): ExistingResumeProjectOption[] {
    return [...existingProjects].sort((left, right) => {
      const leftSameType = left.type === item.type ? 0 : 1;
      const rightSameType = right.type === item.type ? 0 : 1;
      return leftSameType - rightSameType || left.name.localeCompare(right.name);
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await onConfirm(items.map(toResumeExperienceConfirmationInput));
      setConfirmState(result);
      if (result.status === "success") onClose?.();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      await onCancel();
      onClose?.();
    });
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold text-foreground">
            {t.heading}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t.source(fileName, cancelNote)}
          </p>
          {sourceNote ? (
            <p className="text-xs text-muted-foreground">{sourceNote}</p>
          ) : null}
        </div>
        <Button
          disabled={isPending}
          onClick={addItem}
          size="sm"
          type="button"
          variant="outline"
        >
          {t.add}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-subtle p-4 text-sm text-muted-foreground">
          {t.empty}
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
                  {item.extractedName ? t.extractedItem(index + 1) : t.manualItem(index + 1)}
                </p>
                <Button
                  disabled={isPending}
                  onClick={() => removeItem(item.clientId)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t.delete}
                </Button>
              </div>
              <ResumeExperienceFields
                disabled={isPending}
                label={t.fieldsLabel(index + 1)}
                onChange={(patch) => updateFields(item.clientId, patch)}
                value={{
                  type: item.type,
                  name: item.finalName,
                  organization: item.organization,
                  description: item.description,
                }}
              />
              {existingProjects.length > 0 ? (
                <FieldLabel>
                  {t.linkExisting}
                  <Select
                    disabled={isPending}
                    onChange={(event) =>
                      updateItem(item.clientId, {
                        selectedExistingItemId: event.target.value || null,
                      })
                    }
                    value={item.selectedExistingItemId ?? ""}
                  >
                    <option value="">{t.newItem}</option>
                    {sortedOptionsFor(item).map((option) => (
                      <option key={option.id} value={option.id}>
                        {optionLabel(option, typeLabels)}
                      </option>
                    ))}
                  </Select>
                </FieldLabel>
              ) : null}
              {item.extractedName ? (
                <p className="text-xs text-muted-foreground">
                  {t.extractedName(item.extractedName)}
                  {item.recommendedExistingItemId ? t.preselected : ""}
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
            {t.blankName}
          </p>
        ) : null}
        <Button disabled={isPending} onClick={handleCancel} variant="outline">
          {t.cancel}
        </Button>
        <Button disabled={isPending || hasBlankName} onClick={handleConfirm}>
          {isPending ? t.saving : t.confirm}
        </Button>
      </div>
    </section>
  );
}
