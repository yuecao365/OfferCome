import { CalendarClock, NotebookPen } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeInterviewTime } from "@/lib/interviews/relative-time";
import { roundLabel } from "@/lib/interviews/types";
import type { UpcomingInterview, UpcomingInterviews } from "@/lib/interviews/upcoming";

function InterviewRow({
  interview,
  now,
  action,
}: {
  interview: UpcomingInterview;
  now: Date;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {interview.companyName} · {interview.jobTitle}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {roundLabel(interview.round)} · {describeInterviewTime(interview.interviewedAt, now)}
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
  const { upcoming, awaitingRecord } = interviews;
  if (upcoming.length === 0 && awaitingRecord.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" strokeWidth={1.5} />
          面试日程
        </CardTitle>
        <CardDescription>
          面试前可以直接查看这家公司问过的问题，并针对性练一场。
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border py-0">
        {upcoming.map((interview) => (
          <InterviewRow
            action={
              <ButtonLink href={`/interviews/prepare/${interview.id}`} size="sm">
                去准备
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
                补录问答
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
          面试结束了？补录问题和回答后，这场面试会计入复盘和能力画像。
        </CardContent>
      ) : null}
    </Card>
  );
}
