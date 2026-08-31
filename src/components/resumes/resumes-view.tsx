import type { ComponentProps, ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { ResumeList } from "@/components/resumes/resume-list";
import { ResumeProjectsPanel } from "@/components/resumes/resume-projects-panel";
import type { ResumeListItem, ResumeProjectListItem } from "@/lib/resumes/types";

/**
 * 简历中心的呈现层。本地版（服务端取数、文件预览）和体验版
 * （浏览器取数、解析文本预览）渲染同一个组件；预览与上传入口
 * 由页面注入，因为两版的数据来源不同（文件 vs 解析文本）。
 */
export function ResumesView({
  resumes,
  selectedId,
  projects,
  uploadModal,
  preview,
  description,
  listActions,
  projectsPanel,
}: {
  resumes: ResumeListItem[];
  selectedId: string | null;
  projects: ResumeProjectListItem[];
  uploadModal: ReactNode;
  preview: ReactNode;
  description: string;
  /** 体验版在此注入浏览器动作。 */
  listActions?: ComponentProps<typeof ResumeList>["actions"];
  projectsPanel?: Pick<
    ComponentProps<typeof ResumeProjectsPanel>,
    "saveAction" | "deleteAction"
  >;
}) {
  return (
    <>
      <PageHeader
        actions={uploadModal}
        description={description}
        eyebrow="求职管理"
        title="简历中心"
      />

      <section className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ResumeList actions={listActions} resumes={resumes} selectedId={selectedId} />
        {preview}
      </section>

      <ResumeProjectsPanel projects={projects} {...projectsPanel} />
    </>
  );
}
