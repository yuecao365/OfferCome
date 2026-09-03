"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  ResumeExperienceFields,
  resumeProjectDeleteMessage,
  type ResumeExperienceFieldsValue,
} from "@/components/resumes/resume-experience-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  projectIndexLabel,
  reviewHref,
  type InterviewReviewProject,
  type InterviewReviewSourceFilter,
} from "@/lib/interviews/review";
import { normalizeExperienceType } from "@/lib/resumes/confirmation";
import {
  deleteResumeProject,
  saveResumeProject,
} from "@/lib/resumes/project-actions";

const NEW_PROJECT_ID = "new";

const blankDraft: ResumeExperienceFieldsValue = {
  type: "project",
  name: "",
  organization: null,
  description: null,
};

const indexRowClassName =
  "flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-control border border-border px-3 py-2 text-[0.8125rem] transition-colors duration-150 hover:bg-surface-subtle";

type ReviewProjectIndexProps = {
  projects: InterviewReviewProject[];
  unlinkedQuestionCount: number;
  activeProjectId: string | null;
  source: InterviewReviewSourceFilter;
};

/**
 * 复盘左侧的实习/项目索引：既是筛选入口，也能直接增删改，
 * 复用简历中心那套字段与 server action，避免两处逻辑走偏。
 */
export function ReviewProjectIndex({
  projects,
  unlinkedQuestionCount,
  activeProjectId,
  source,
}: ReviewProjectIndexProps) {
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

  function startEdit(project: InterviewReviewProject) {
    setEditingId(project.id);
    setDraft({
      type: normalizeExperienceType(project.type),
      name: project.name,
      organization: project.organization || null,
      description: project.description,
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(blankDraft);
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

  function handleDelete(project: InterviewReviewProject) {
    if (
      !window.confirm(
        resumeProjectDeleteMessage(project.name, project.questionCount),
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteResumeProject(project.id);
      setMessage({ status: result.status, text: result.message });

      if (result.status === "success") {
        cancelEdit();
        if (activeProjectId === project.id) {
          router.push(reviewHref({ section: "projects", source }));
        }
        router.refresh();
      }
    });
  }

  function renderEditor(label: string) {
    return (
      <div className="grid gap-3 rounded-lg border border-border bg-surface-subtle p-3">
        <ResumeExperienceFields
          disabled={isPending}
          label={label}
          onChange={(patch) =>
            setDraft((current) => ({ ...current, ...patch }))
          }
          value={draft}
        />
        <div className="flex justify-end gap-2">
          <Button
            disabled={isPending}
            onClick={cancelEdit}
            size="sm"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={isPending || !draft.name.trim()}
            onClick={handleSave}
            size="sm"
          >
            {isPending ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="min-w-0 overflow-hidden xl:sticky xl:top-20">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>实习/项目索引</CardTitle>
        <div className="flex items-center gap-3">
          <Button
            disabled={isPending || editingId === NEW_PROJECT_ID}
            onClick={startCreate}
            size="sm"
            variant="outline"
          >
            新增
          </Button>
          <Link
            className="text-xs font-semibold text-brand hover:text-brand-hover"
            href={reviewHref({ section: "overview", source })}
          >
            返回概览
          </Link>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-2 overflow-hidden">
        {message ? (
          <p
            aria-live="polite"
            className={cn(
              "text-xs",
              message.status === "error" ? "text-danger" : "text-muted-foreground",
            )}
          >
            {message.text}
          </p>
        ) : null}

        {editingId === NEW_PROJECT_ID ? renderEditor("新增实习/项目") : null}

        {projects.length === 0 && editingId !== NEW_PROJECT_ID ? (
          <p className="rounded-lg bg-surface-subtle p-3 text-sm leading-6 text-muted-foreground">
            还没有从简历中识别到实习/项目。可以点击「新增」手动补一个，也可以先查看未关联问题。
          </p>
        ) : null}

        {projects.map((project) => {
          if (editingId === project.id) {
            return (
              <div key={project.id}>{renderEditor(project.name)}</div>
            );
          }

          const isActive = activeProjectId === project.id;
          const label = projectIndexLabel(project);
          return (
            <div className="flex min-w-0 items-center gap-1" key={project.id}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(indexRowClassName, isActive && "border-border-strong bg-surface-subtle font-medium")}
                href={reviewHref({
                  section: "projects",
                  projectId: project.id,
                  source,
                })}
                title={label}
              >
                <span className="block min-w-0 flex-1 truncate font-medium text-foreground">
                  {label}
                </span>
                <Badge className="shrink-0" tone={project.questionCount > 0 ? "brand" : "neutral"}>
                  {project.questionCount}
                </Badge>
              </Link>
              <Button
                aria-label={`编辑 ${label}`}
                className="px-2"
                disabled={isPending}
                onClick={() => startEdit(project)}
                size="sm"
                variant="ghost"
              >
                <Pencil aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                aria-label={`删除 ${label}`}
                className="px-2 text-danger hover:bg-danger-soft hover:text-danger-strong"
                disabled={isPending}
                onClick={() => handleDelete(project)}
                size="sm"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          );
        })}

        <Link
          aria-current={activeProjectId === "unlinked" ? "page" : undefined}
          className={cn(
            indexRowClassName,
            activeProjectId === "unlinked" && "border-border-strong bg-surface-subtle font-medium",
          )}
          href={reviewHref({
            section: "projects",
            projectId: "unlinked",
            source,
          })}
        >
          <span className="block min-w-0 flex-1 truncate font-medium text-foreground">
            未关联项目
          </span>
          <Badge className="shrink-0" tone={unlinkedQuestionCount > 0 ? "brand" : "neutral"}>
            {unlinkedQuestionCount}
          </Badge>
        </Link>
      </CardContent>
    </Card>
  );
}
