"use client";

import { Briefcase } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const NEW_PROJECT_ID = "new";

const blankDraft: ResumeExperienceFieldsValue = {
  type: "project",
  name: "",
  organization: null,
  description: null,
};

type ResumeProjectsPanelProps = {
  projects: ResumeProjectListItem[];
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
          取消
        </Button>
        <Button
          disabled={disabled || !draft.name.trim()}
          onClick={onSave}
          size="sm"
        >
          {disabled ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Lets the user fix, remove, or add internship/project records after upload,
 * so a wrong extraction is never permanent.
 */
export function ResumeProjectsPanel({ projects }: ResumeProjectsPanelProps) {
  const router = useRouter();
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
      const result = await saveResumeProject({
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
    if (!window.confirm(resumeProjectDeleteMessage(project.name))) {
      return;
    }

    startTransition(async () => {
      const result = await deleteResumeProject(project.id);
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
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Briefcase aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2
            className="text-sm font-semibold text-foreground"
            id="resume-projects-title"
          >
            实习 / 项目 · {projects.length}
          </h2>
        </div>
        <Button
          disabled={isPending || editingId === NEW_PROJECT_ID}
          onClick={startCreate}
          size="sm"
          variant="outline"
        >
          新增实习/项目
        </Button>
      </div>

      <div className="grid gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          这里是面试题生成使用的实习/项目库。上传简历时自动识别的条目可以在这里改名、改类型、补充描述或删除；没识别到的可以手动新增。
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
              label="新增实习/项目"
              onCancel={cancelEdit}
              onChange={updateDraft}
              onSave={handleSave}
            />
          </div>
        ) : null}

        {projects.length === 0 && editingId !== NEW_PROJECT_ID ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-subtle p-4 text-sm text-muted-foreground">
            还没有实习/项目记录。上传简历自动识别，或点击「新增实习/项目」手动添加。
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
                      {resumeExperienceTypeLabel(project.type)}
                    </Badge>
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {project.name}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      project.organization,
                      project.sourceResumeName
                        ? `来源：${project.sourceResumeName}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "暂无公司/组织信息"}
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
                    编辑
                  </Button>
                  <Button
                    className="text-danger hover:bg-danger-soft hover:text-danger-strong"
                    disabled={isPending}
                    onClick={() => handleDelete(project)}
                    size="sm"
                    variant="ghost"
                  >
                    删除
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
