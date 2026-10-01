"use client";

import { CalendarClock, NotebookPen } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { describeInterviewTime } from "@/lib/interviews/relative-time";
import { roundLabel } from "@/lib/interviews/types";
import type { UpcomingInterview, UpcomingInterviews } from "@/lib/interviews/upcoming";

const messages = defineMessages({
  "zh-CN": {
    title: "面试日程",
    prepare: "去准备",
    record: "补录问答",
    recordHint: "面试结束了？补录问题和回答后，这场面试会计入复盘和能力画像。",
  },
  en: {
    title: "Interview schedule",
    prepare: "Prepare",
    record: "Add Q&A",
    recordHint: "Interview over? Add the questions and answers so it counts toward your review and capability profile.",
  },
});

function InterviewRow({
  interview,
  now,
  action,
}: {
  interview: UpcomingInterview;
  now: Date;
  action: React.ReactNode;
}) {
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {interview.companyName} · {interview.jobTitle}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {roundLabel(interview.round, locale)} · {describeInterviewTime(interview.interviewedAt, now, locale)}
        </p>
      </div>
      {action}
    </div>
  );
}

/**
 * 面试日程：即将到来的面试给备战入口，刚结束的提醒回来补录问答。
 * 两者都没有时整张卡不渲染，避免占位噪音。
 */
export function UpcomingInterviewsCard({
  interviews,
  now = new Date(),
}: {
  interviews: UpcomingInterviews;
  now?: Date;
}) {
  const t = useMessages(messages);
  const { upcoming, awaitingRecord } = interviews;
  if (upcoming.length === 0 && awaitingRecord.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" strokeWidth={1.5} />
          {t.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border py-0">
        {upcoming.map((interview) => (
          <InterviewRow
            action={
              <ButtonLink href={`/interviews/prepare/${interview.id}`} size="sm">
                {t.prepare}
              </ButtonLink>
            }
            interview={interview}
            key={interview.id}
            now={now}
          />
        ))}
        {awaitingRecord.map((interview) => (
          <InterviewRow
            action={
              <ButtonLink
                href="/interviews/history"
                size="sm"
                variant="outline"
              >
                <NotebookPen aria-hidden="true" className="size-4" />
                {t.record}
              </ButtonLink>
            }
            interview={interview}
            key={interview.id}
            now={now}
          />
        ))}
      </CardContent>
      {awaitingRecord.length > 0 ? (
        <CardContent className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          {t.recordHint}
        </CardContent>
      ) : null}
    </Card>
  );
}
