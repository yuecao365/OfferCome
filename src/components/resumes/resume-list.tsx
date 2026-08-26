import { Check, FileText } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ResumeListItem } from "@/lib/resumes/types";
import { formatFileSize, resumeTypeLabel } from "@/lib/resumes/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format/date";

import { ResumeActions } from "./resume-actions";

type ResumeListProps = {
  resumes: ResumeListItem[];
  selectedId: string | null;
};

export function ResumeList({ resumes, selectedId }: ResumeListProps) {
  if (resumes.length === 0) {
    return (
      <EmptyState
        description="上传第一份 PDF、DOC、DOCX 或图片简历后，可以在这里管理版本。"
        icon={<FileText aria-hidden="true" className="size-5" />}
        title="还没有简历"
      />
    );
  }

  return (
    <section aria-labelledby="resume-list-title" className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground" id="resume-list-title">
          简历版本 · {resumes.length}
        </h2>
      </div>
      <div className="divide-y divide-border">
        {resumes.map((resume) => {
          const selected = selectedId === resume.id;
          return (
            <article className={cn("p-3 transition-colors", selected ? "bg-accent/55" : "hover:bg-surface-subtle")} key={resume.id}>
              <Link
                aria-current={selected ? "page" : undefined}
                className="block rounded-lg p-1 focus-visible:outline-offset-2"
                href={`/resumes?preview=${resume.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">{resume.originalName}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {resumeTypeLabel(resume.mimeType, resume.originalName)} · {formatFileSize(resume.fileSize)}
                    </p>
                    <p className="text-xs text-muted-foreground">上传于 {formatDate(resume.createdAt)}</p>
                  </div>
                  {selected ? <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" /> : null}
                </div>
              </Link>
              <div className="mt-3 flex items-center justify-between gap-2 px-1">
                {resume.isDefault ? <Badge tone="brand">默认使用</Badge> : <span />}
                <ResumeActions id={resume.id} isDefault={resume.isDefault} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
