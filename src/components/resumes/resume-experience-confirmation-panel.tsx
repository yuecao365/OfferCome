"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldLabel, Select } from "@/components/ui/form-controls";
import {
  createPendingResumeExperience,
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

function optionLabel(option: ExistingResumeProjectOption): string {
  const typeLabel = option.type === "internship" ? "实习" : "项目";
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
  const sourceNote = resumeExtractionSourceNote(extractionSource);

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
            确认简历中的实习/项目，可修改、删除或手动补充。
          </h3>
          <p className="text-xs text-muted-foreground">
            来源简历：{fileName}。{cancelNote}
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
          添加实习/项目
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-subtle p-4 text-sm text-muted-foreground">
          未识别到实习或项目。可以点击「添加实习/项目」手动补充，也可以直接确认只保存简历。
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
              {existingProjects.length > 0 ? (
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
              ) : null}
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
