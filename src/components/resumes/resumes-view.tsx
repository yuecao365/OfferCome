"use client";

import type { ComponentProps, ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { accentIf, StatTiles } from "@/components/stat-tiles";
import { ResumeList } from "@/components/resumes/resume-list";
import { ResumeProjectsPanel } from "@/components/resumes/resume-projects-panel";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import type { ResumeListItem, ResumeProjectListItem } from "@/lib/resumes/types";

const messages = defineMessages({
  "zh-CN": {
    title: "简历中心",
    versions: "简历版本",
    defaultResume: (name: string) => `默认使用：${name}`,
    noDefault: "还没设默认简历",
    projects: "已抽取项目",
    projectsNote: "可用作面试素材的实习与项目",
    pending: "待你确认",
    pendingNote: "自动识别出来、还没确认的项目",
  },
  en: {
    title: "Resumes",
    versions: "Resume versions",
    defaultResume: (name: string) => `Default: ${name}`,
    noDefault: "No default resume yet",
    projects: "Extracted projects",
    projectsNote: "Internships and projects usable as interview material",
    pending: "Awaiting your review",
    pendingNote: "Auto-detected projects you haven't confirmed",
  },
});

/**
 * 简历中心的呈现层。本地版（服务端取数、文件预览）和体验版
 * （浏览器取数、解析文本预览）渲染同一个组件；预览与上传入口
 * 由页面注入，因为两版的数据来源不同（文件 vs 解析文本）。
 * 版式：三张指标卡（简历版本 / 默认简历 / 已抽取项目）→ 左窄右宽（版本列表 | 预览）→ 项目面板。
 */
export function ResumesView({
  resumes,
  selectedId,
  projects,
  uploadModal,
  preview,
  listActions,
  projectsPanel,
}: {
  resumes: ResumeListItem[];
  selectedId: string | null;
  projects: ResumeProjectListItem[];
  uploadModal: ReactNode;
  preview: ReactNode;
  /** 体验版在此注入浏览器动作。 */
  listActions?: ComponentProps<typeof ResumeList>["actions"];
  projectsPanel?: Pick<
    ComponentProps<typeof ResumeProjectsPanel>,
    "saveAction" | "deleteAction"
  >;
}) {
  const t = useMessages(messages);
  const defaultName = resumes.find((resume) => resume.isDefault)?.originalName;
  const pendingCount = projects.filter((project) => project.autoExtracted).length;

  return (
    <>
      <PageHeader
        actions={uploadModal}
        title={t.title}
      />

      <StatTiles
        tiles={[
          { label: t.versions, value: resumes.length, note: defaultName ? t.defaultResume(defaultName) : t.noDefault },
          { label: t.projects, value: projects.length, note: t.projectsNote },
          { label: t.pending, value: pendingCount, note: t.pendingNote, tone: accentIf(pendingCount) },
        ]}
      />
      <section className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ResumeList actions={listActions} resumes={resumes} selectedId={selectedId} />
        {preview}
      </section>

      <ResumeProjectsPanel projects={projects} {...projectsPanel} />
    </>
  );
}
