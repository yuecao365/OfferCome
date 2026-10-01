"use client";

import { Activity, CalendarClock, ExternalLink, History, Sparkles } from "lucide-react";

import { profileLevelLabel } from "@/components/candidate-profile/profile-labels";
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
import { PROFILE_DIMENSION_LABELS_I18N } from "@/lib/candidate-profile/types";
import { formatDateTime } from "@/lib/format/date";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import type { InterviewPrepareData } from "@/lib/interviews/prepare";
import { describeInterviewTime } from "@/lib/interviews/relative-time";
import { roundLabel } from "@/lib/interviews/types";

const messages = defineMessages({
  "zh-CN": {
    practice: "针对这场练一遍",
    jobPage: "查看岗位页面",
    companyTitle: "这家公司问过你什么",
    companyDescription: (company: string) => `来自你记录过的 ${company} 真实面试，按相同问题聚合。`,
    companyEmpty: (company: string) => `还没有 ${company} 的历史面试记录。面试结束后记得回来补录，下次就能派上用场。`,
    weakTitle: "这类岗位你的弱项",
    scopeRole: "基于你在同类岗位面试中的表现。",
    scopeAll: "同类岗位样本还不够，这里展示的是你的整体弱项。",
    scopeNone: "能力画像还在积累。",
    weakEmpty: "完成两场有效面试后，这里会给出针对性的弱项提示。",
    dimensionEmpty: "这个维度的证据还在积累，暂时没有具体结论。",
  },
  en: {
    practice: "Practice for this interview",
    jobPage: "View job posting",
    companyTitle: "What this company has asked you",
    companyDescription: (company: string) => `From the real ${company} interviews you've recorded, grouped by question.`,
    companyEmpty: (company: string) => `No past ${company} interviews recorded yet. Add this one after the interview and it will help next time.`,
    weakTitle: "Your weak spots for this kind of role",
    scopeRole: "Based on your interviews for similar roles.",
    scopeAll: "Not enough samples for similar roles yet, so these are your overall weak spots.",
    scopeNone: "Your capability profile is still building up.",
    weakEmpty: "After two valid interviews, targeted weak-spot tips will appear here.",
    dimensionEmpty: "Evidence for this dimension is still building up — no specific conclusion yet.",
  },
});

/** 备战页发起的模拟面试尽量带上完整岗位上下文。 */
function mockHref(data: InterviewPrepareData): string {
  const params = new URLSearchParams();
  if (data.interview.applicationId) {
    params.set("applicationId", data.interview.applicationId);
  } else {
    params.set("companyName", data.interview.companyName);
    params.set("jobTitle", data.interview.jobTitle);
  }
  return `/interviews/mock?${params.toString()}`;
}

/** 真实面试备战页的呈现层：本地版从库取数，体验版从浏览器工作台取数，渲染同一棵组件树。 */
export function InterviewPrepareView({ data }: { data: InterviewPrepareData }) {
  const { interview, companyQuestions, weakDimensions, weakDimensionScope } = data;
  const locale = useLocale();
  const t = useMessages(messages);

  return (
    <>
      <PageHeader
        actions={
          <ButtonLink href={mockHref(data)}>
            <Sparkles aria-hidden="true" className="size-4" />
            {t.practice}
          </ButtonLink>
        }
        title={`${interview.companyName} · ${interview.jobTitle}`}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarClock aria-hidden="true" className="size-4 text-brand" />
            {describeInterviewTime(interview.interviewedAt, undefined, locale)}
          </span>
          <span className="text-sm text-muted-foreground">
            {formatDateTime(interview.interviewedAt, "", locale)}
          </span>
          <Badge tone="brand">{roundLabel(interview.round, locale)}</Badge>
          {interview.jobUrl ? (
            <a
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-hover"
              href={interview.jobUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t.jobPage}
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
              {t.companyTitle}
            </CardTitle>
            <CardDescription>
              {t.companyDescription(interview.companyName)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuestionReviewList
              empty={t.companyEmpty(interview.companyName)}
              items={companyQuestions}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity aria-hidden="true" className="size-4 text-brand" />
              {t.weakTitle}
            </CardTitle>
            <CardDescription>
              {weakDimensionScope === "role"
                ? t.scopeRole
                : weakDimensionScope === "all"
                  ? t.scopeAll
                  : t.scopeNone}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {weakDimensions.length === 0 ? (
              <p className="rounded-lg bg-surface-subtle p-4 text-sm leading-6 text-muted-foreground">
                {t.weakEmpty}
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
                        {PROFILE_DIMENSION_LABELS_I18N[locale][item.dimension]}
                      </strong>
                      <Badge>{profileLevelLabel(item.levelLabel, locale)}</Badge>
                    </div>
                    {item.insightTitles.length > 0 ? (
                      <ul className="mt-3 grid gap-1.5 text-sm leading-6 text-muted-foreground">
                        {item.insightTitles.map((title) => (
                          <li key={title}>· {title}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {t.dimensionEmpty}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
