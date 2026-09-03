import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  MessagesSquare,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ApplicationStageChart } from "@/components/dashboard/application-stage-chart";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { NextActionCard } from "@/components/dashboard/next-action-card";
import { UpcomingInterviewsCard } from "@/components/interviews/upcoming-interviews-card";
import { PageHeader } from "@/components/page-header";
import { StatHero } from "@/components/stat-hero";
import { StageBadge } from "@/components/stage-badge";
import { ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  APPLICATION_TREND_RANGE_OPTIONS,
  buildApplicationStageChartData,
  getApplicationTrendRangeOption,
} from "@/lib/applications/analytics";
import type {
  ApplicationStats,
  ApplicationTrendRange,
} from "@/lib/applications/types";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format/date";
import type { InterviewStats } from "@/lib/interviews/types";
import type { UpcomingInterviews } from "@/lib/interviews/upcoming";

function trendHref(range: ApplicationTrendRange, homeHref: string): string {
  return range === "14d" ? homeHref : `${homeHref}?trend=${range}`;
}

/**
 * 数据概览页的呈现层。本地版（服务端取数）和体验版（浏览器取数）
 * 渲染同一个组件，统计口径来自共享的纯函数。
 */
export function DashboardView({
  stats,
  interviewStats,
  upcomingInterviews,
  trendRange,
  homeHref,
  gettingStarted,
}: {
  stats: ApplicationStats;
  interviewStats: InterviewStats;
  upcomingInterviews: UpcomingInterviews;
  trendRange: ApplicationTrendRange;
  homeHref: string;
  /** 开始清单是服务端取数的 async 组件，由本地版页面注入；体验版不传。 */
  gettingStarted?: ReactNode;
}) {
  const trendOption = getApplicationTrendRangeOption(trendRange);
  const stageChartData = buildApplicationStageChartData(stats.stageCounts);

  return (
    <>
      <PageHeader
        actions={
          <ButtonLink href="/applications">
            <BriefcaseBusiness aria-hidden="true" className="size-4" />
            管理投递
          </ButtonLink>
        }
        description="汇总岗位投递和面试记录，快速判断整体进展、近期变化与下一步重点。"
        title="数据概览"
      />

      {gettingStarted}

      <StatHero
        badge={
          stats.recent7Days > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
              最近 7 天 +{stats.recent7Days}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              最近 7 天暂无新增
            </span>
          )
        }
        label="投递岗位"
        note="按投递或首次发现时间统计"
        tiles={[
          { label: "7 天新增", value: stats.recent7Days },
          { label: "真实面试", value: interviewStats.total },
          { label: "Offer", value: stats.stageCounts.offer },
        ]}
        value={stats.total}
      />

      <UpcomingInterviewsCard interviews={upcomingInterviews} />

      {stats.total === 0 ? (
        <EmptyState
          action={<ButtonLink href="/applications">新建或同步投递</ButtonLink>}
          description="目前没有可用于分析的岗位记录。你可以手动新建投递，或同步已有的 Boss 直聘记录。"
          title="工作台还没有数据"
        />
      ) : (
        <>
          <section>
            <Card>
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>投递趋势</CardTitle>
                  <CardDescription>
                    {trendOption.description} · 按{trendOption.granularityLabel}聚合 · 单位：岗位数。
                  </CardDescription>
                </div>
                <nav
                  aria-label="投递趋势时间范围"
                  className="flex w-full rounded-lg border border-border bg-surface-subtle p-1 sm:w-auto"
                >
                  {APPLICATION_TREND_RANGE_OPTIONS.map((option) => {
                    const isActive = option.value === trendRange;
                    return (
                      <Link
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex h-8 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground sm:flex-none",
                          isActive && "bg-surface text-foreground shadow-card",
                        )}
                        href={trendHref(option.value, homeHref)}
                        key={option.value}
                        scroll={false}
                      >
                        {option.label}
                      </Link>
                    );
                  })}
                </nav>
              </CardHeader>
              <CardContent>
                <ApplicationTrendChart
                  data={stats.trend}
                  granularityLabel={trendOption.granularityLabel}
                  rangeDescription={trendOption.description}
                />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <Card>
              <CardHeader>
                <CardTitle>岗位阶段分布</CardTitle>
                <CardDescription>查看岗位当前主要卡在哪个环节，优先处理数量集中的阶段。</CardDescription>
              </CardHeader>
              <CardContent>
                <ApplicationStageChart data={stageChartData} />
              </CardContent>
            </Card>
            <NextActionCard applications={stats} interviews={interviewStats} />
          </section>

          <section>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>最近投递</CardTitle>
                  <CardDescription>最近新增或同步的岗位记录。</CardDescription>
                </div>
                <Link className="text-sm font-semibold text-brand hover:text-brand-hover" href="/applications">
                  查看全部
                </Link>
              </CardHeader>
              <CardContent className="py-1">
                <div className="divide-y divide-border">
                  {stats.recentApplications.map((application) => (
                    <Link
                      className="group relative -mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-4 transition-colors duration-200 ease-app hover:bg-surface-subtle"
                      href="/applications"
                      key={application.id}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      />
                      <div className="min-w-0 pl-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {application.companyName}
                        </p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {application.jobTitle}
                        </p>
                      </div>
                      <StageBadge stage={application.stage} />
                    </Link>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border py-3 text-xs text-muted-foreground">
                  <span>最近同步：{formatDateTime(stats.latestSyncedAt, "尚未同步")}</span>
                  {stats.sourceCounts.slice(0, 2).map((source) => (
                    <span key={source.source}>{source.source} · {source.count}</span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </>
  );
}
