"use client";

import type { ComponentProps } from "react";

import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ListPagination } from "@/components/ui/list-pagination";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format/date";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import {
  getLatestAnsweredQuestionId,
  QUESTION_REVIEW_ORIGIN_LABELS_I18N,
  type QuestionReviewItem,
  type QuestionReviewPage,
} from "@/lib/interviews/review";
import { roundLabel } from "@/lib/interviews/types";

import {
  ReviewQuestionReclassify,
  type ReclassifyProjectOption,
} from "./review-question-reclassify";

const messages = defineMessages({
  "zh-CN": {
    projectRelated: "项目相关",
    technical: "技术问题",
    general: "通用问题",
    overviewAria: "复盘记录概览",
    overviewTitle: "已沉淀复盘记录",
    overviewNote: (n: number) => `覆盖 ${n} 个已识别的实习或项目；所有数字均来自现有面试记录。`,
    frequent: "高频 · ",
    realCount: (n: number) => `真实 ${n} 次`,
    mockCount: (n: number) => `模拟 ${n} 次`,
    lastAsked: (at: string) => `最近 ${at}`,
    unset: "未设置",
    showAnswers: "查看回答",
    collapse: "收起",
    practiceAgain: "用这题再练",
    pagination: "复盘问题分页",
    unit: "个问题",
  },
  en: {
    projectRelated: "Project-related",
    technical: "Technical",
    general: "General",
    overviewAria: "Review records overview",
    overviewTitle: "Review records collected",
    overviewNote: (n: number) => `Covers ${n} recognized internship${n === 1 ? "" : "s"} or project${n === 1 ? "" : "s"}; all figures come from your existing interview records.`,
    frequent: "Frequent · ",
    realCount: (n: number) => `Real ×${n}`,
    mockCount: (n: number) => `Mock ×${n}`,
    lastAsked: (at: string) => `Last asked ${at}`,
    unset: "Not set",
    showAnswers: "Show answers",
    collapse: "Collapse",
    practiceAgain: "Practice this question again",
    pagination: "Review question pages",
    unit: "questions",
  },
});

export function ReviewScopeCard({
  href,
  title,
  count,
  isActive,
}: {
  href: string;
  title: string;
  count: number;
  isActive: boolean;
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-4 rounded-panel border bg-surface px-4 py-3.5 transition-colors duration-150 hover:bg-surface-subtle",
        isActive ? "border-border-strong bg-surface-subtle" : "border-border",
      )}
      href={href}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
      </span>
      <span className="shrink-0 text-lg font-medium tabular-nums text-foreground">{count}</span>
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
        strokeWidth={1.5}
      />
    </Link>
  );
}

/** 概览：一个总数 + 三类计数的无框指标条，不再放流程图示。 */
export function InterviewReviewOverview({
  projectCount,
  projectQuestionCount,
  technicalQuestionCount,
  generalQuestionCount,
}: {
  projectCount: number;
  projectQuestionCount: number;
  technicalQuestionCount: number;
  generalQuestionCount: number;
}) {
  const t = useMessages(messages);
  const total = projectQuestionCount + technicalQuestionCount + generalQuestionCount;
  const parts = [
    { label: t.projectRelated, value: projectQuestionCount },
    { label: t.technical, value: technicalQuestionCount },
    { label: t.general, value: generalQuestionCount },
  ];

  return (
    <section
      aria-label={t.overviewAria}
      className="grid gap-6 rounded-panel border border-border bg-surface p-5 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-10"
    >
      <div>
        <p className="text-xs text-muted-foreground">{t.overviewTitle}</p>
        <p className="mt-1 text-display tabular-nums text-foreground">{total}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.overviewNote(projectCount)}
        </p>
      </div>
      <dl className="flex divide-x divide-border">
        {parts.map((part) => (
          <div className="px-6 first:pl-0 last:pr-0" key={part.label}>
            <dt className="text-xs text-muted-foreground">{part.label}</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums text-foreground">{part.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function QuestionReviewList({
  items,
  empty,
  reclassifyProjects,
  reclassifyAction,
}: {
  items: QuestionReviewItem[];
  empty: string;
  /** 传入实习/项目选项时，每条记录可以直接改归类；只读场景省略即可。 */
  reclassifyProjects?: ReclassifyProjectOption[];
  /** 体验版在此注入浏览器归类动作。 */
  reclassifyAction?: ComponentProps<typeof ReviewQuestionReclassify>["action"];
}) {
  const locale = useLocale();
  const t = useMessages(messages);
  if (items.length === 0) {
    return (
      <div className="rounded-panel border border-dashed border-border-strong bg-surface p-6 text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const latestAnsweredQuestionId = getLatestAnsweredQuestionId(item);
        const isFrequentlyAskedInRealInterviews = item.realAskedCount >= 2;
        return (
          <details
            className={cn(
              "group overflow-hidden rounded-panel border bg-surface",
              isFrequentlyAskedInRealInterviews
                ? "border-border-strong bg-surface-subtle"
                : "border-border",
            )}
            key={`${item.category}-${item.resumeProjectId ?? "none"}-${item.question}`}
          >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4 transition-colors hover:bg-surface-subtle">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {item.realAskedCount > 0 ? (
                  <Badge tone={isFrequentlyAskedInRealInterviews ? "warning" : "brand"}>
                    {isFrequentlyAskedInRealInterviews ? t.frequent : ""}{t.realCount(item.realAskedCount)}
                  </Badge>
                ) : null}
                {item.mockAskedCount > 0 ? (
                  <Badge tone="info">{t.mockCount(item.mockAskedCount)}</Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">{t.lastAsked(formatDateTime(item.lastAskedAt, t.unset, locale))}</span>
              </div>
              <h3 className="text-sm font-semibold leading-6 text-foreground">{item.question}</h3>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
              <span className="group-open:hidden">{t.showAnswers}</span>
              <span className="hidden group-open:inline">{t.collapse}</span>
              <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="grid gap-3 border-t border-border bg-surface-subtle p-4">
            {latestAnsweredQuestionId ? (
              <div>
                <ButtonLink
                  href={`/interviews/mock?seedQuestionId=${encodeURIComponent(latestAnsweredQuestionId)}`}
                  size="sm"
                  variant="outline"
                >
                  {t.practiceAgain}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </ButtonLink>
              </div>
            ) : null}
            {item.answers.map((answer) => (
              <article className="rounded-control border border-border bg-surface p-4" key={answer.id}>
                <p className="whitespace-pre-wrap border-l-2 border-brand/40 pl-3 text-sm leading-7 text-foreground">
                  {answer.answer}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={answer.origin === "mock" ? "info" : "brand"}>
                    {QUESTION_REVIEW_ORIGIN_LABELS_I18N[locale][answer.origin]}
                  </Badge>
                  <span>
                    {answer.companyName} · {answer.jobTitle} · {formatDateTime(answer.interviewedAt, t.unset, locale)} · {roundLabel(answer.round, locale)}
                  </span>
                </div>
              </article>
            ))}
            {reclassifyProjects ? (
              <ReviewQuestionReclassify
                action={reclassifyAction}
                category={item.category}
                projects={reclassifyProjects}
                questionIds={item.answers.map((answer) => answer.id)}
                resumeProjectId={item.resumeProjectId}
              />
            ) : null}
          </div>
          </details>
        );
      })}
    </div>
  );
}

export function ReviewPagination({
  page,
  hrefForPage,
}: {
  page: QuestionReviewPage;
  hrefForPage: (page: number) => string;
}) {
  const t = useMessages(messages);
  if (page.totalPages <= 1) return null;

  return (
    <ListPagination
      ariaLabel={t.pagination}
      hrefForPage={hrefForPage}
      page={page.page}
      total={page.total}
      totalPages={page.totalPages}
      unit={t.unit}
    />
  );
}
