import { Activity, CalendarClock, ExternalLink, History, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { QuestionReviewList } from "@/components/interviews/interview-review-components";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format/date";
import { getInterviewPrepareData } from "@/lib/interviews/prepare";
import { describeInterviewTime } from "@/lib/interviews/relative-time";
import { roundLabel } from "@/lib/interviews/types";

/** 备战页发起的模拟面试尽量带上完整岗位上下文。 */
function mockHref(data: NonNullable<Awaited<ReturnType<typeof getInterviewPrepareData>>>): string {
  const params = new URLSearchParams();
  if (data.interview.applicationId) {
    params.set("applicationId", data.interview.applicationId);
  } else {
    params.set("companyName", data.interview.companyName);
    params.set("jobTitle", data.interview.jobTitle);
  }
  return `/interviews/mock?${params.toString()}`;
}

export default async function InterviewPreparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const data = await getInterviewPrepareData(id);
  if (!data) notFound();

  const { interview, companyQuestions, weakDimensions, weakDimensionScope } = data;

  return (
    <AppShell active="interviews" subActive="interviews-history">
      <PageHeader
        actions={
          <ButtonLink href={mockHref(data)}>
            <Sparkles aria-hidden="true" className="size-4" />
            针对这场练一遍
          </ButtonLink>
        }
        description="面试前集中查看这家公司问过的问题和你当前较弱的能力方向。"
        title={`${interview.companyName} · ${interview.jobTitle}`}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarClock aria-hidden="true" className="size-4 text-brand" />
            {describeInterviewTime(interview.interviewedAt)}
          </span>
          <span className="text-sm text-muted-foreground">
            {formatDateTime(interview.interviewedAt)}
          </span>
          <Badge tone="brand">{roundLabel(interview.round)}</Badge>
          {interview.jobUrl ? (
            <a
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-hover"
              href={interview.jobUrl}
              rel="noreferrer"
              target="_blank"
            >
              查看岗位页面
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History aria-hidden="true" className="size-4 text-brand" />
              这家公司问过你什么
            </CardTitle>
            <CardDescription>
              来自你记录过的 {interview.companyName} 真实面试，按相同问题聚合。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuestionReviewList
              empty={`还没有 ${interview.companyName} 的历史面试记录。面试结束后记得回来补录，下次就能派上用场。`}
              items={companyQuestions}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity aria-hidden="true" className="size-4 text-brand" />
              这类岗位你的弱项
            </CardTitle>
            <CardDescription>
              {weakDimensionScope === "role"
                ? "基于你在同类岗位面试中的表现。"
                : weakDimensionScope === "all"
                  ? "同类岗位样本还不够，这里展示的是你的整体弱项。"
                  : "能力画像还在积累。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {weakDimensions.length === 0 ? (
              <p className="rounded-lg bg-surface-subtle p-4 text-sm leading-6 text-muted-foreground">
                完成两场有效面试后，这里会给出针对性的弱项提示。
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {weakDimensions.map((item) => (
                  <div
                    className="rounded-control border border-border bg-surface p-4"
                    key={item.dimension}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm font-semibold text-foreground">
                        {item.label}
                      </strong>
                      <Badge>{item.levelLabel}</Badge>
                    </div>
                    {item.insightTitles.length > 0 ? (
                      <ul className="mt-3 grid gap-1.5 text-sm leading-6 text-muted-foreground">
                        {item.insightTitles.map((title) => (
                          <li key={title}>· {title}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        这个维度的证据还在积累，暂时没有具体结论。
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
