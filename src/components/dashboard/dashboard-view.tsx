"use client";

import { BriefcaseBusiness } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ApplicationStageChart } from "@/components/dashboard/application-stage-chart";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { UpcomingInterviewsCard } from "@/components/interviews/upcoming-interviews-card";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import { accentIf, StatTiles, toneIf } from "@/components/stat-tiles";
import { StageBadge } from "@/components/stage-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  APPLICATION_TREND_RANGE_OPTIONS,
  applicationTrendRangeText,
  buildApplicationStageChartData,
  getApplicationTrendRangeOption,
} from "@/lib/applications/analytics";
import type {
  ApplicationStats,
  ApplicationTrendRange,
} from "@/lib/applications/types";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format/date";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import type { InterviewStats } from "@/lib/interviews/types";
import type { UpcomingInterviews } from "@/lib/interviews/upcoming";

const messages = defineMessages({
  "zh-CN": {
    title: "数据概览",
    manageApplications: "管理投递",
    tileApplications: "投递岗位",
    tileApplicationsNote: (n: number) => (n > 0 ? `最近 7 天 +${n}` : "最近 7 天暂无新增"),
    tileNew7d: "7 天新增",
    tileNew7dNote: "按投递或首次发现时间",
    tileInterviews: "真实面试",
    tileInterviewsNote: "已记录的面试",
    tileOffer: "Offer",
    tileOfferNote: "当前处于 Offer 阶段",
    emptyAction: "新建或同步投递",
    emptyDescription: "目前没有可用于分析的岗位记录。你可以手动新建投递，或同步已有的 Boss 直聘记录。",
    emptyTitle: "工作台还没有数据",
    trendTitle: "投递趋势",
    trendDescription: (range: string, granularity: string) => `${range} · 按${granularity}聚合 · 单位：岗位数。`,
    trendRangeAria: "投递趋势时间范围",
    stageTitle: "岗位阶段分布",
    recentTitle: "最近投递",
    viewAll: "查看全部",
    latestSynced: (at: string) => `最近同步：${at}`,
    neverSynced: "尚未同步",
  },
  en: {
    title: "Overview",
    manageApplications: "Manage applications",
    tileApplications: "Applications",
    tileApplicationsNote: (n: number) => (n > 0 ? `+${n} in the last 7 days` : "None new in the last 7 days"),
    tileNew7d: "New in 7 days",
    tileNew7dNote: "By applied or first-seen date",
    tileInterviews: "Real interviews",
    tileInterviewsNote: "Interviews on record",
    tileOffer: "Offer",
    tileOfferNote: "Currently at the offer stage",
    emptyAction: "Add or sync applications",
    emptyDescription: "There are no applications to analyze yet. Add one manually, or sync your existing Boss Zhipin records.",
    emptyTitle: "No data yet",
    trendTitle: "Application trend",
    trendDescription: (range: string, granularity: string) => `${range} · grouped by ${granularity} · count of applications.`,
    trendRangeAria: "Application trend time range",
    stageTitle: "Applications by stage",
    recentTitle: "Recent applications",
    viewAll: "View all",
    latestSynced: (at: string) => `Last synced: ${at}`,
    neverSynced: "Never",
  },
});

function trendHref(range: ApplicationTrendRange, homeHref: string): string {
  return range === "14d" ? homeHref : `${homeHref}?trend=${range}`;
}


/**
 * 数据概览页的呈现层。本地版（服务端取数）和体验版（浏览器取数）渲染同一个组件，统计口径来自共享的纯函数。
 * 版式：四张指标卡一排 → 左宽右窄（趋势图 | 即将到来的面试）→ 阶段分布 | 最近投递。
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
  const t = useMessages(messages);
  const locale = useLocale();
  const trendOption = getApplicationTrendRangeOption(trendRange, locale);
  const stageChartData = buildApplicationStageChartData(stats.stageCounts, locale);
  // 面试日程卡在没有待面 / 待补录时不渲染，趋势图就占满一行，不留空列。
  const hasSchedule = upcomingInterviews.upcoming.length + upcomingInterviews.awaitingRecord.length > 0;

  return (
    <>
      <PageHeader
        actions={
          <ButtonLink href="/applications">
            <BriefcaseBusiness aria-hidden="true" className="size-4" />
            {t.manageApplications}
          </ButtonLink>
        }
        title={t.title}
      />

      {gettingStarted}

      <StatTiles
        tiles={[
          { label: t.tileApplications, value: stats.total, note: t.tileApplicationsNote(stats.recent7Days) },
          { label: t.tileNew7d, value: stats.recent7Days, note: t.tileNew7dNote, tone: accentIf(stats.recent7Days) },
          { label: t.tileInterviews, value: interviewStats.total, note: t.tileInterviewsNote },
          { label: t.tileOffer, value: stats.stageCounts.offer, note: t.tileOfferNote, tone: toneIf(stats.stageCounts.offer, "success") },
        ]}
      />

      {stats.total === 0 ? (
        <>
          <UpcomingInterviewsCard interviews={upcomingInterviews} />
          <EmptyState
            action={<ButtonLink href="/applications">{t.emptyAction}</ButtonLink>}
            description={t.emptyDescription}
            title={t.emptyTitle}
          />
        </>
      ) : (
        <>
          {/* 第二行：左宽右窄。左边趋势图是主视觉，右边是即将到来的面试（没有就通栏）。 */}
          <section className={cn("grid gap-4", hasSchedule && "xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]")}>
            <Card className="flex flex-col">
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{t.trendTitle}</CardTitle>
                  <CardDescription>
                    {t.trendDescription(trendOption.description, trendOption.granularityLabel)}
                  </CardDescription>
                </div>
                <SegmentedLinks
                  ariaLabel={t.trendRangeAria}
                  items={APPLICATION_TREND_RANGE_OPTIONS.map((option) => ({
                    href: trendHref(option.value, homeHref),
                    label: applicationTrendRangeText(option.value, locale).label,
                    active: option.value === trendRange,
                  }))}
                />
              </CardHeader>
              <CardContent className="flex-1">
                <ApplicationTrendChart
                  data={stats.trend}
                  granularityLabel={trendOption.granularityLabel}
                  rangeDescription={trendOption.description}
                />
              </CardContent>
            </Card>
            <UpcomingInterviewsCard interviews={upcomingInterviews} />
          </section>

          {/* 第三行：阶段分布与最近投递并排。 */}
          <section className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t.stageTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <ApplicationStageChart data={stageChartData} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>{t.recentTitle}</CardTitle>
                </div>
                <Link className="text-xs text-muted-foreground hover:text-foreground" href="/applications">
                  {t.viewAll}
                </Link>
              </CardHeader>
              <CardContent className="py-1">
                <div className="divide-y divide-border">
                  {stats.recentApplications.slice(0, 5).map((application) => (
                    <Link
                      className="group relative -mx-2 flex items-center justify-between gap-4 rounded-control px-2 py-3 transition-colors duration-150 hover:bg-surface-subtle"
                      href="/applications"
                      key={application.id}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      />
                      <div className="min-w-0 pl-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {application.companyName}
                        </p>
                        <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
                          {application.jobTitle}
                        </p>
                      </div>
                      <StageBadge stage={application.stage} />
                    </Link>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border py-3 text-xs text-muted-foreground">
                  <span>{t.latestSynced(formatDateTime(stats.latestSyncedAt, t.neverSynced, locale))}</span>
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
