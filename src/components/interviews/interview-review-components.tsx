import {
  ArrowRight,
  BookOpenCheck,
  ChevronDown,
  FolderKanban,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  SearchCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  getLatestAnsweredQuestionId,
  type QuestionReviewItem,
  type QuestionReviewPage,
} from "@/lib/interviews/review";
import { roundLabel } from "@/lib/interviews/types";

function formatDateTime(date: Date | null): string {
  if (!date) return "未设置";

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ReviewScopeCard({
  href,
  title,
  description,
  count,
  isActive,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  count: number;
  isActive: boolean;
  icon: ReactNode;
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex min-h-32 items-start gap-4 rounded-xl border bg-surface p-5 shadow-card transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-brand/35 hover:bg-surface-subtle",
        isActive && "border-brand/40 bg-accent/60",
      )}
      href={href}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <strong className="text-sm font-semibold text-foreground">{title}</strong>
          <Badge tone={count > 0 ? "brand" : "neutral"}>{count} 条</Badge>
        </span>
        <span className="mt-2 block text-sm leading-6 text-muted-foreground">{description}</span>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">
          进入复盘
          <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}

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
  const total = projectQuestionCount + technicalQuestionCount + generalQuestionCount;
  const steps = [
    { label: "回看回答", description: "找到真实记录", icon: MessageSquareText },
    { label: "识别模式", description: "按项目和类型归类", icon: SearchCheck },
    { label: "准备改进", description: "沉淀下一次表达", icon: Lightbulb },
  ];

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-0 p-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">复盘路径</p>
          <h2 className="mt-2 max-w-xl text-xl font-semibold tracking-tight text-foreground">
            把历史回答整理成下一次面试的准备材料
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            从真实面试问题出发，按项目经历或问题类型聚合回答，减少逐条翻找记录的成本。
          </p>

          <ol className="relative mt-7 grid gap-3 sm:grid-cols-3" aria-label="面试复盘的三个步骤">
            <span
              aria-hidden="true"
              className="absolute left-[16%] right-[16%] top-5 hidden h-px bg-gradient-to-r from-brand/20 via-brand/70 to-brand/20 sm:block"
            />
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li className="relative flex items-center gap-3 sm:flex-col sm:text-center" key={step.label}>
                  <span className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-surface text-brand shadow-card">
                    <Icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {index + 1}. {step.label}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{step.description}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="border-t border-border bg-surface-subtle p-6 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <BookOpenCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">已沉淀复盘记录</p>
              <p className="text-2xl font-semibold text-foreground">{total}</p>
            </div>
          </div>
          <dl className="mt-5 grid gap-2">
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <FolderKanban aria-hidden="true" className="size-4" />
                项目相关
              </dt>
              <dd className="text-sm font-semibold text-foreground">{projectQuestionCount}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <ListChecks aria-hidden="true" className="size-4" />
                技术问题
              </dt>
              <dd className="text-sm font-semibold text-foreground">{technicalQuestionCount}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquareText aria-hidden="true" className="size-4" />
                通用问题
              </dt>
              <dd className="text-sm font-semibold text-foreground">{generalQuestionCount}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            覆盖 {projectCount} 个已识别的实习或项目；所有数字均来自现有面试记录。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuestionReviewList({
  items,
  empty,
}: {
  items: QuestionReviewItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const latestAnsweredQuestionId = getLatestAnsweredQuestionId(item);
        return (
          <details
            className="group overflow-hidden rounded-xl border border-border bg-surface shadow-card"
            key={`${item.category}-${item.resumeProjectId ?? "none"}-${item.question}`}
          >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4 transition-colors hover:bg-surface-subtle">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={item.askedCount > 1 ? "warning" : "neutral"}>
                  被问到 {item.askedCount} 次
                </Badge>
                <span className="text-xs text-muted-foreground">最近 {formatDateTime(item.lastAskedAt)}</span>
              </div>
              <h3 className="text-sm font-semibold leading-6 text-foreground">{item.question}</h3>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand">
              <span className="group-open:hidden">查看回答</span>
              <span className="hidden group-open:inline">收起</span>
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
                  用这题再练
                  <ArrowRight aria-hidden="true" className="size-4" />
                </ButtonLink>
              </div>
            ) : null}
            {item.answers.map((answer) => (
              <article className="rounded-lg border border-border bg-surface p-4" key={answer.id}>
                <p className="whitespace-pre-wrap border-l-2 border-brand/40 pl-3 text-sm leading-7 text-foreground">
                  {answer.answer || "未记录回答"}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {answer.companyName} · {answer.jobTitle} · {formatDateTime(answer.interviewedAt)} · {roundLabel(answer.round)}
                </p>
              </article>
            ))}
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
  if (page.totalPages <= 1) return null;

  return (
    <nav
      aria-label="复盘问题分页"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-card"
    >
      <p className="text-muted-foreground">
        第 {page.page} / {page.totalPages} 页，共 {page.total} 个问题
      </p>
      <div className="flex gap-2">
        <ButtonLink
          aria-disabled={page.page <= 1}
          className={cn(page.page <= 1 && "pointer-events-none opacity-50")}
          href={hrefForPage(page.page - 1)}
          size="sm"
          variant="outline"
        >
          上一页
        </ButtonLink>
        <ButtonLink
          aria-disabled={page.page >= page.totalPages}
          className={cn(page.page >= page.totalPages && "pointer-events-none opacity-50")}
          href={hrefForPage(page.page + 1)}
          size="sm"
          variant="outline"
        >
          下一页
        </ButtonLink>
      </div>
    </nav>
  );
}
