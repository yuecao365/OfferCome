"use client";

import { Briefcase } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { resumeExperienceTypeLabel } from "@/lib/resumes/confirmation";
import {
  deleteResumeProject,
  saveResumeProject,
} from "@/lib/resumes/project-actions";
import type { ResumeProjectListItem } from "@/lib/resumes/types";

import {
  ResumeExperienceFields,
  resumeProjectDeleteMessage,
  type ResumeExperienceFieldsValue,
} from "./resume-experience-fields";

const messages = defineMessages({
  "zh-CN": {
    cancel: "取消",
    saving: "保存中...",
    save: "保存",
    heading: (count: number) => `实习 / 项目 · ${count}`,
    add: "新增实习/项目",
    intro: "这里是面试题生成使用的实习/项目库。上传简历时自动识别的条目可以在这里改名、改类型、补充描述或删除；没识别到的可以手动新增。",
    empty: "还没有实习/项目记录。上传简历自动识别，或点击「新增实习/项目」手动添加。",
    autoExtractedHint: "出题前由系统从简历自动识别，尚未经你确认；编辑一次即视为确认。",
    autoExtracted: "自动识别，未确认",
    source: (name: string) => `来源：${name}`,
    noOrganization: "暂无公司/组织信息",
    edit: "编辑",
    delete: "删除",
  },
  en: {
    cancel: "Cancel",
    saving: "Saving...",
    save: "Save",
    heading: (count: number) => `Internships / projects · ${count}`,
    add: "Add internship/project",
    intro: "This is the internship/project library used to generate interview questions. Rename, retype, describe or delete items detected from your resume here, and add any that were missed.",
    empty: "No internships or projects yet. Upload a resume to detect them, or click \"Add internship/project\" to add one by hand.",
    autoExtractedHint: "Detected from your resume before question generation and not yet confirmed by you. Editing it once counts as confirming.",
    autoExtracted: "Auto-detected, unconfirmed",
    source: (name: string) => `Source: ${name}`,
    noOrganization: "No company/organization info",
    edit: "Edit",
    delete: "Delete",
  },
});

const NEW_PROJECT_ID = "new";

const blankDraft: ResumeExperienceFieldsValue = {
  type: "project",
  name: "",
  organization: null,
  description: null,
};

type ResumeProjectsPanelProps = {
  projects: ResumeProjectListItem[];
  /** 覆盖默认的 Server Action（体验版传浏览器实现）。 */
  saveAction?: typeof saveResumeProject;
  deleteAction?: typeof deleteResumeProject;
};

function ProjectEditor({
  draft,
  disabled,
  label,
  onChange,
  onCancel,
  onSave,
}: {
  draft: ResumeExperienceFieldsValue;
  disabled: boolean;
  label: string;
  onChange: (patch: Partial<ResumeExperienceFieldsValue>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useMessages(messages);
  return (
    <div className="grid gap-3">
      <ResumeExperienceFields
        disabled={disabled}
        label={label}
        onChange={onChange}
        value={draft}
      />
      <div className="flex justify-end gap-2">
        <Button disabled={disabled} onClick={onCancel} size="sm" variant="outline">
          {t.cancel}
        </Button>
        <Button
          disabled={disabled || !draft.name.trim()}
          onClick={onSave}
          size="sm"
        >
          {disabled ? t.saving : t.save}
        </Button>
      </div>
    </div>
  );
}

/**
 * Lets the user fix, remove, or add internship/project records after upload,
 * so a wrong extraction is never permanent.
 */
export function ResumeProjectsPanel({
  projects,
  saveAction = saveResumeProject,
  deleteAction = deleteResumeProject,
}: ResumeProjectsPanelProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = messages[locale];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ResumeExperienceFieldsValue>(blankDraft);
  const [message, setMessage] = useState<{
    status: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function startCreate() {
    setEditingId(NEW_PROJECT_ID);
    setDraft(blankDraft);
    setMessage(null);
  }

  function startEdit(project: ResumeProjectListItem) {
    setEditingId(project.id);
    setDraft({
      type: project.type,
      name: project.name,
      organization: project.organization,
      description: project.description,
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(blankDraft);
  }

  function updateDraft(patch: Partial<ResumeExperienceFieldsValue>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveAction({
        id: editingId === NEW_PROJECT_ID ? null : editingId,
        name: draft.name,
        type: draft.type,
        organization: draft.organization,
        description: draft.description,
      });
      setMessage({ status: result.status, text: result.message });

      if (result.status === "success") {
        cancelEdit();
        router.refresh();
      }
    });
  }

  function handleDelete(project: ResumeProjectListItem) {
    if (!window.confirm(resumeProjectDeleteMessage(project.name, 0, locale))) {
      return;
    }

    startTransition(async () => {
      const result = await deleteAction(project.id);
      setMessage({ status: result.status, text: result.message });

      if (result.status === "success") {
        if (editingId === project.id) {
          cancelEdit();
        }
        router.refresh();
      }
    });
  }

  return (
    <section
      aria-labelledby="resume-projects-title"
      className="overflow-hidden rounded-panel border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Briefcase aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2
            className="text-sm font-semibold text-foreground"
            id="resume-projects-title"
          >
            {t.heading(projects.length)}
          </h2>
        </div>
        <Button
          disabled={isPending || editingId === NEW_PROJECT_ID}
          onClick={startCreate}
          size="sm"
          variant="outline"
        >
          {t.add}
        </Button>
      </div>

      <div className="grid gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          {t.intro}
        </p>

        {message ? (
          <p
            aria-live="polite"
            className={
              message.status === "error"
                ? "text-sm text-danger"
                : "text-sm text-muted-foreground"
            }
          >
            {message.text}
          </p>
        ) : null}

        {editingId === NEW_PROJECT_ID ? (
          <div className="rounded-lg border border-border bg-surface-subtle p-3">
            <ProjectEditor
              disabled={isPending}
              draft={draft}
              label={t.add}
              onCancel={cancelEdit}
              onChange={updateDraft}
              onSave={handleSave}
            />
          </div>
        ) : null}

        {projects.length === 0 && editingId !== NEW_PROJECT_ID ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-subtle p-4 text-sm text-muted-foreground">
            {t.empty}
          </p>
        ) : null}

        {projects.map((project) => (
          <div
            className="grid gap-3 rounded-lg border border-border p-3"
            key={project.id}
          >
            {editingId === project.id ? (
              <ProjectEditor
                disabled={isPending}
                draft={draft}
                label={project.name}
                onCancel={cancelEdit}
                onChange={updateDraft}
                onSave={handleSave}
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={project.type === "internship" ? "brand" : "neutral"}>
                      {resumeExperienceTypeLabel(project.type, locale)}
                    </Badge>
                    {project.autoExtracted ? (
                      <Badge
                        title={t.autoExtractedHint}
                        tone="warning"
                      >
                        {t.autoExtracted}
                      </Badge>
                    ) : null}
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {project.name}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      project.organization,
                      project.sourceResumeName
                        ? t.source(project.sourceResumeName)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t.noOrganization}
                  </p>
                  {project.description ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {project.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    disabled={isPending}
                    onClick={() => startEdit(project)}
                    size="sm"
                    variant="outline"
                  >
                    {t.edit}
                  </Button>
                  <Button
                    className="text-danger hover:bg-danger-soft hover:text-danger-strong"
                    disabled={isPending}
                    onClick={() => handleDelete(project)}
                    size="sm"
                    variant="ghost"
                  >
                    {t.delete}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
