"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ResumeListItem } from "@/lib/resumes/types";
import { formatFileSize, resumeTypeLabel } from "@/lib/resumes/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format/date";
import { useLocale } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

import { ResumeActions } from "./resume-actions";

const messages = defineMessages({
  "zh-CN": {
    emptyTitle: "还没有简历",
    emptyDescription: "上传第一份 PDF、DOC、DOCX 或图片简历后，可以在这里管理版本。",
    heading: (count: number) => `简历版本 · ${count}`,
    uploadedAt: (date: string) => `上传于 ${date}`,
    default: "默认使用",
  },
  en: {
    emptyTitle: "No resumes yet",
    emptyDescription: "Upload your first resume as a PDF, DOC, DOCX or image to manage versions here.",
    heading: (count: number) => `Resume versions · ${count}`,
    uploadedAt: (date: string) => `Uploaded ${date}`,
    default: "Default",
  },
});

type ResumeListProps = {
  resumes: ResumeListItem[];
  selectedId: string | null;
  /** 体验版在此注入浏览器动作。 */
  actions?: Pick<
    ComponentProps<typeof ResumeActions>,
    "setDefaultAction" | "deleteAction" | "deleteConfirmMessage"
  >;
};

export function ResumeList({ resumes, selectedId, actions }: ResumeListProps) {
  const locale = useLocale();
  const t = messages[locale];

  if (resumes.length === 0) {
    return (
      <EmptyState
        description={t.emptyDescription}
        title={t.emptyTitle}
      />
    );
  }

  return (
    <section aria-labelledby="resume-list-title" className="overflow-hidden rounded-panel bg-surface shadow-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground" id="resume-list-title">
          {t.heading(resumes.length)}
        </h2>
      </div>
      <div className="divide-y divide-border">
        {resumes.map((resume) => {
          const selected = selectedId === resume.id;
          return (
            <article className={cn("relative p-3 transition-colors duration-150", selected ? "bg-surface-subtle before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-brand" : "hover:bg-surface-subtle")} key={resume.id}>
              <Link
                aria-current={selected ? "page" : undefined}
                className="block rounded-lg p-1 focus-visible:outline-offset-2"
                href={`/resumes?preview=${resume.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">{resume.originalName}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {resumeTypeLabel(resume.mimeType, resume.originalName, locale)} · {formatFileSize(resume.fileSize)}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.uploadedAt(formatDate(resume.createdAt, "", locale))}</p>
                  </div>
                  {selected ? <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" /> : null}
                </div>
              </Link>
              <div className="mt-3 flex items-center justify-between gap-2 px-1">
                {resume.isDefault ? <Badge tone="brand">{t.default}</Badge> : <span />}
                <ResumeActions id={resume.id} isDefault={resume.isDefault} {...actions} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
