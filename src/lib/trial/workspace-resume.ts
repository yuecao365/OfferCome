import {
  resumePreviewKind,
  type ResumeListItem,
  type ResumeProjectListItem,
} from "@/lib/resumes/types";
import type { ResumeProjectOption } from "@/lib/interviews/types";

import type { TrialWorkspace } from "./workspace";

/**
 * 网页版的简历中心适配层（纯函数）。
 *
 * 服务端不保存任何文件：原件放在访客浏览器的文件仓库里（见 file-store.ts），
 * 解析文本与实习/项目条目放在工作台文档里。"简历版本"只有一份，再上传即替换。
 * 实习/项目条目与本地版承担相同职责：面试题目可关联、复盘可按项目聚合。
 */

export const TRIAL_RESUME_ID = "trial-resume";
/** 原始简历文件在浏览器文件仓库里的键。 */
export const TRIAL_RESUME_FILE_KEY = "resume";

/**
 * 与本地版 getResumes() 相同的列表条目形状。
 * fileUrl 是浏览器为原始文件生成的 blob 地址（没存到原件时为 null，
 * 页面据此降级成解析文本预览）。
 */
export function trialResumeListItems(
  workspace: TrialWorkspace,
  fileUrl: string | null = null,
): ResumeListItem[] {
  if (!workspace.resume) return [];
  const meta = workspace.resumeMeta ?? null;
  const savedAt = new Date(meta?.savedAt ?? new Date().toISOString());
  const originalName = meta?.fileName ?? "我的简历（手动填写）";
  const mimeType = meta?.mimeType ?? "text/plain";
  const previewKind = fileUrl ? resumePreviewKind(mimeType, originalName) : "none";
  return [
    {
      id: TRIAL_RESUME_ID,
      originalName,
      storedName: "",
      mimeType,
      fileSize:
        meta?.fileSize ?? new TextEncoder().encode(workspace.resume.text).length,
      isDefault: true,
      createdAt: savedAt,
      updatedAt: savedAt,
      previewUrl: fileUrl ?? "",
      downloadUrl: fileUrl ?? "",
      canPreviewInline: previewKind !== "none",
      previewKind,
    },
  ];
}

/** 与本地版 getResumeProjects() 相同的实习/项目条目形状。 */
export function trialResumeProjects(
  workspace: TrialWorkspace,
): ResumeProjectListItem[] {
  const meta = workspace.resumeMeta ?? null;
  return (workspace.resume?.projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    type: project.type === "internship" ? "internship" : "project",
    organization: project.organization || null,
    description: project.description || null,
    sourceResumeName: meta?.fileName ?? null,
  }));
}

/** 面试表单"关联实习/项目"下拉框用的选项。 */
export function trialResumeProjectOptions(
  workspace: TrialWorkspace,
): ResumeProjectOption[] {
  return (workspace.resume?.projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
  }));
}

/** 与本地版 saveResumeProject 同责：新增或更新一条实习/项目。 */
export function saveTrialResumeProject(
  workspace: TrialWorkspace,
  input: {
    id: string | null;
    name: string;
    type: string;
    organization: string | null;
    description: string | null;
  },
): TrialWorkspace {
  if (!workspace.resume) return workspace;
  const record = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    type: input.type === "internship" ? "internship" : "project",
    organization: input.organization?.trim() ?? "",
    description: input.description?.trim() ?? "",
  };
  const projects = input.id
    ? workspace.resume.projects.map((project) =>
        project.id === input.id ? record : project,
      )
    : [...workspace.resume.projects, record];
  return { ...workspace, resume: { ...workspace.resume, projects } };
}

/** 与本地版 deleteResumeProject 同责；同时解开面试题目上的关联。 */
export function deleteTrialResumeProject(
  workspace: TrialWorkspace,
  id: string,
): TrialWorkspace {
  if (!workspace.resume) return workspace;
  return {
    ...workspace,
    resume: {
      ...workspace.resume,
      projects: workspace.resume.projects.filter((project) => project.id !== id),
    },
    interviews: workspace.interviews.map((interview) =>
      interview.questions.some((question) => question.resumeProjectId === id)
        ? {
            ...interview,
            questions: interview.questions.map((question) =>
              question.resumeProjectId === id
                ? { ...question, resumeProjectId: null }
                : question,
            ),
          }
        : interview,
    ),
  };
}
