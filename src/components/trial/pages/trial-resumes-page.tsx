"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/modal";
import { ResumePreview } from "@/components/resumes/resume-preview";
import { ResumesView } from "@/components/resumes/resumes-view";
import { TrialResumeEditor } from "@/components/trial/trial-resume-editor";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatFileSize, resumeTypeLabel } from "@/lib/resumes/types";
import { deleteStoredFile, readStoredFile } from "@/lib/trial/file-store";
import {
  TRIAL_RESUME_FILE_KEY,
  deleteTrialResumeProject,
  saveTrialResumeProject,
  trialResumeListItems,
  trialResumeProjects,
} from "@/lib/trial/workspace-resume";
import { setWorkspaceResume } from "@/lib/trial/workspace";
import { mutateWorkspace, useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 网页版的简历中心：与本地版渲染同一个 ResumesView 与 ResumePreview。
 * 原始文件存在浏览器的文件仓库里，预览时现取一个 blob 地址喂给预览组件，
 * 所以 PDF/图片能像本地版一样直接内嵌预览、也能下载。
 * 手动填写（没有原件）时退回展示解析文本——那正是 AI 出题用的内容。
 */
export function TrialResumesPage() {
  const workspace = useTrialWorkspace();
  const savedAt = workspace?.resumeMeta?.savedAt ?? null;
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  // 每次简历变化都重新取原件；blob 地址在替换和卸载时都要释放。
  useEffect(() => {
    let revoked = false;
    let url: string | null = null;

    void readStoredFile(TRIAL_RESUME_FILE_KEY).then((stored) => {
      if (revoked || !stored) return;
      url = URL.createObjectURL(stored.blob);
      setFileUrl(url);
    });

    return () => {
      revoked = true;
      setFileUrl(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [savedAt]);

  if (!workspace) {
    // 首帧（SSR/未水合）还读不到浏览器数据，水合后立即补齐。
    return null;
  }

  const resumes = trialResumeListItems(workspace, fileUrl);
  const selected = resumes[0] ?? null;

  return (
    <ResumesView
      description="管理简历版本。文件与解析内容都只保存在你自己的浏览器，服务器不存储。"
      listActions={{
        deleteAction: async () => {
          await deleteStoredFile(TRIAL_RESUME_FILE_KEY);
          mutateWorkspace((current) => setWorkspaceResume(current, null));
        },
        deleteConfirmMessage:
          "删除后将清除这份简历的文件、解析文本与实习/项目条目，需要时可重新上传。",
      }}
      preview={
        selected && workspace.resume ? (
          selected.previewKind === "none" ? (
            <Card className="min-w-0 overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="truncate text-sm font-semibold text-foreground">
                  {selected.originalName}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {resumeTypeLabel(selected.mimeType, selected.originalName)} ·{" "}
                  {formatFileSize(selected.fileSize)} · 解析文本（AI 出题所用内容）
                </p>
              </div>
              <div className="max-h-[72vh] min-h-[40vh] overflow-auto bg-surface-subtle p-5">
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                  {workspace.resume.text}
                </p>
              </div>
            </Card>
          ) : (
            <ResumePreview
              downloadUrl={selected.downloadUrl}
              key={selected.previewUrl}
              name={selected.originalName}
              previewKind={selected.previewKind}
              previewUrl={selected.previewUrl}
              sizeLabel={formatFileSize(selected.fileSize)}
              typeLabel={resumeTypeLabel(selected.mimeType, selected.originalName)}
            />
          )
        ) : null
      }
      projects={trialResumeProjects(workspace)}
      projectsPanel={{
        saveAction: async (input) => {
          if (!workspace.resume) {
            return {
              status: "error",
              message: "请先上传或填写一份简历，再管理实习/项目。",
            };
          }
          if (!input.name.trim()) {
            return { status: "error", message: "请填写名称。" };
          }
          mutateWorkspace((current) => saveTrialResumeProject(current, input));
          return { status: "success", message: "实习/项目已保存。" };
        },
        deleteAction: async (id) => {
          mutateWorkspace((current) => deleteTrialResumeProject(current, id));
          return { status: "success", message: "实习/项目已删除。" };
        },
      }}
      resumes={resumes}
      selectedId={selected?.id ?? null}
      uploadModal={
        <Modal
          size="compact"
          title="上传简历"
          triggerClassName={buttonClassName()}
          triggerLabel={workspace.resume ? "重新上传简历" : "上传简历"}
        >
          {(close) => (
            <TrialResumeEditor
              onSaved={(resume, meta) => {
                mutateWorkspace((current) =>
                  setWorkspaceResume(current, resume, meta),
                );
                close();
              }}
            />
          )}
        </Modal>
      }
    />
  );
}
