"use client";

import { Modal } from "@/components/modal";
import { ResumesView } from "@/components/resumes/resumes-view";
import { TrialResumeEditor } from "@/components/trial/trial-resume-editor";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatFileSize, resumeTypeLabel } from "@/lib/resumes/types";
import {
  deleteTrialResumeProject,
  saveTrialResumeProject,
  trialResumeListItems,
  trialResumeProjects,
} from "@/lib/trial/workspace-resume";
import { setWorkspaceResume } from "@/lib/trial/workspace";
import { mutateWorkspace, useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 体验版的简历中心：与本地版渲染同一个 ResumesView。
 * 体验版不保存原始文件，"简历版本"只有一份（再上传即替换），
 * 预览区展示解析文本——那正是 AI 出题所用的内容。
 */
export function TrialResumesPage() {
  const workspace = useTrialWorkspace();

  if (!workspace) {
    // 首帧（SSR/未水合）还读不到浏览器数据，水合后立即补齐。
    return null;
  }

  const resumes = trialResumeListItems(workspace);
  const selected = resumes[0] ?? null;

  return (
    <ResumesView
      description="管理简历内容。体验版不保存原始文件，只保留解析文本与实习/项目条目，全部存在当前浏览器。"
      listActions={{
        deleteAction: async () => {
          mutateWorkspace((current) => setWorkspaceResume(current, null));
        },
        deleteConfirmMessage:
          "删除后将清空体验简历的解析文本与实习/项目条目，需要时可重新上传。",
      }}
      preview={
        selected && workspace.resume ? (
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
