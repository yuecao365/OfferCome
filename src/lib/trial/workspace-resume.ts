import type {
  ResumeListItem,
  ResumeProjectListItem,
} from "@/lib/resumes/types";
import type { ResumeProjectOption } from "@/lib/interviews/types";

import type { TrialWorkspace } from "./workspace";

/**
 * 体验版的简历中心适配层（纯函数）。
 *
 * 体验版不保存原始文件，只保存解析后的文本与实习/项目条目，所以：
 * - "简历版本"永远只有一份（再上传即替换）；
 * - 预览区展示解析文本而不是原始文件。
 * 实习/项目条目与本地版承担相同职责：面试题目可关联、复盘可按项目聚合。
 */

export const TRIAL_RESUME_ID = "trial-resume";

/** 与本地版 getResumes() 相同的列表条目形状（文件相关字段以占位补齐）。 */
export function trialResumeListItems(workspace: TrialWorkspace): ResumeListItem[] {
  if (!workspace.resume) return [];
  const meta = workspace.resumeMeta ?? null;
  const savedAt = new Date(meta?.savedAt ?? new Date().toISOString());
  return [
    {
      id: TRIAL_RESUME_ID,
      originalName: meta?.fileName ?? "体验简历（手动填写）",
      storedName: "",
      mimeType: meta?.mimeType ?? "text/plain",
      fileSize:
        meta?.fileSize ?? new TextEncoder().encode(workspace.resume.text).length,
      isDefault: true,
      createdAt: savedAt,
      updatedAt: savedAt,
      previewUrl: "",
      downloadUrl: "",
      canPreviewInline: false,
      previewKind: "none",
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
