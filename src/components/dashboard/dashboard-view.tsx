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
  const trendOption = getApplicationTrendRangeOption(trendRange);
  const stageChartData = buildApplicationStageChartData(stats.stageCounts);
  // 面试日程卡在没有待面 / 待补录时不渲染，趋势图就占满一行，不留空列。
  const hasSchedule = upcomingInterviews.upcoming.length + upcomingInterviews.awaitingRecord.length > 0;

  return (
    <>
      <PageHeader
        actions={
          <ButtonLink href="/applications">
            <BriefcaseBusiness aria-hidden="true" className="size-4" />
            管理投递
          </ButtonLink>
        }
        title="数据概览"
      />

      {gettingStarted}

      <StatTiles
        tiles={[
          { label: "投递岗位", value: stats.total, note: stats.recent7Days > 0 ? `最近 7 天 +${stats.recent7Days}` : "最近 7 天暂无新增" },
          { label: "7 天新增", value: stats.recent7Days, note: "按投递或首次发现时间", tone: accentIf(stats.recent7Days) },
          { label: "真实面试", value: interviewStats.total, note: "已记录的面试" },
          { label: "Offer", value: stats.stageCounts.offer, note: "当前处于 Offer 阶段", tone: toneIf(stats.stageCounts.offer, "success") },
        ]}
      />

      {stats.total === 0 ? (
        <>
          <UpcomingInterviewsCard interviews={upcomingInterviews} />
          <EmptyState
            action={<ButtonLink href="/applications">新建或同步投递</ButtonLink>}
            description="目前没有可用于分析的岗位记录。你可以手动新建投递，或同步已有的 Boss 直聘记录。"
            title="工作台还没有数据"
          />
        </>
      ) : (
        <>
          {/* 第二行：左宽右窄。左边趋势图是主视觉，右边是即将到来的面试（没有就通栏）。 */}
          <section className={cn("grid gap-4", hasSchedule && "xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]")}>
            <Card className="flex flex-col">
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>投递趋势</CardTitle>
                  <CardDescription>
                    {trendOption.description} · 按{trendOption.granularityLabel}聚合 · 单位：岗位数。
                  </CardDescription>
                </div>
                <SegmentedLinks
                  ariaLabel="投递趋势时间范围"
                  items={APPLICATION_TREND_RANGE_OPTIONS.map((option) => ({
                    href: trendHref(option.value, homeHref),
                    label: option.label,
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
                <CardTitle>岗位阶段分布</CardTitle>
              </CardHeader>
              <CardContent>
                <ApplicationStageChart data={stageChartData} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>最近投递</CardTitle>
                </div>
                <Link className="text-xs text-muted-foreground hover:text-foreground" href="/applications">
                  查看全部
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
