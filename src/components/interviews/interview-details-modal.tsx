"use client";

import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modal";
import type { InterviewListItem } from "@/lib/interviews/types";
import { questionCategoryLabel, roundLabel } from "@/lib/interviews/types";

function formatDateTime(date: Date | null): string {
  if (!date) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function InterviewDetailsModal({ interview }: { interview: InterviewListItem }) {
  return (
    <Modal title={`${interview.companyName} · ${interview.jobTitle}`} triggerLabel="查看详情">
      {() => (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>{formatDateTime(interview.interviewedAt)}</span>
            <span>·</span>
            <span>{roundLabel(interview.round)}</span>
            <span>·</span>
            <span>{interview.questionCount} 个问题</span>
          </div>
          {interview.note ? (
            <div className="rounded-lg border border-border bg-surface-subtle p-3 text-sm leading-6 text-muted-foreground">
              {interview.note}
            </div>
          ) : null}
          {interview.questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">这场面试还没有记录问题。</p>
          ) : (
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
              {interview.questions.map((question, index) => (
                <article className="rounded-lg border border-border p-4" key={question.id}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">问题 {index + 1}</span>
                    <Badge>{questionCategoryLabel(question.category)}</Badge>
                    {question.resumeProjectName ? <Badge tone="brand">{question.resumeProjectName}</Badge> : null}
                  </div>
                  <h3 className="text-sm font-semibold leading-6 text-foreground">{question.question}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {question.answer || "未记录回答"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
