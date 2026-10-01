"use client";

import { Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modal";
import { buttonClassName } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format/date";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import type { InterviewListItem } from "@/lib/interviews/types";
import { questionCategoryLabel, roundLabel } from "@/lib/interviews/types";

const messages = defineMessages({
  "zh-CN": {
    viewDetails: "查看详情",
    unset: "未设置",
    questionCount: (n: number) => `${n} 个问题`,
    noQuestions: "这场面试还没有记录问题。",
    question: (n: number) => `问题 ${n}`,
    noAnswer: "未记录回答",
  },
  en: {
    viewDetails: "View details",
    unset: "Not set",
    questionCount: (n: number) => `${n} question${n === 1 ? "" : "s"}`,
    noQuestions: "No questions recorded for this interview yet.",
    question: (n: number) => `Question ${n}`,
    noAnswer: "No answer recorded",
  },
});

export function InterviewDetailsModal({ interview }: { interview: InterviewListItem }) {
  const locale = useLocale();
  const t = useMessages(messages);
  return (
    <Modal
      title={`${interview.companyName} · ${interview.jobTitle}`}
      triggerClassName={buttonClassName({ variant: "ghost", size: "icon-sm" })}
      triggerLabel={<Eye aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
      triggerTitle={t.viewDetails}
    >
      {() => (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>{formatDateTime(interview.interviewedAt, t.unset, locale)}</span>
            <span>·</span>
            <span>{roundLabel(interview.round, locale)}</span>
            <span>·</span>
            <span>{t.questionCount(interview.questionCount)}</span>
          </div>
          {interview.note ? (
            <div className="rounded-lg border border-border bg-surface-subtle p-3 text-sm leading-6 text-muted-foreground">
              {interview.note}
            </div>
          ) : null}
          {interview.questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t.noQuestions}</p>
          ) : (
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
              {interview.questions.map((question, index) => (
                <article className="rounded-lg border border-border p-4" key={question.id}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">{t.question(index + 1)}</span>
                    <Badge>{questionCategoryLabel(question.category, locale)}</Badge>
                    {question.resumeProjectName ? <Badge tone="brand">{question.resumeProjectName}</Badge> : null}
                  </div>
                  <h3 className="text-sm font-semibold leading-6 text-foreground">{question.question}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {question.answer || t.noAnswer}
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
