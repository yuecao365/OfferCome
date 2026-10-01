"use client";

import type { ApplicationStage } from "@/lib/applications/types";
import type { ComponentProps } from "react";

import { NewApplicationModal } from "@/components/application-modals";
import { ApplicationFilters } from "@/components/application-filters";
import { ApplicationsTable } from "@/components/applications-table";
import { PageHeader } from "@/components/page-header";
import { SyncBossButton } from "@/components/sync-boss-button";
import { accentIf, StatTiles, toneIf } from "@/components/stat-tiles";
import { Card } from "@/components/ui/card";
import { ListPagination } from "@/components/ui/list-pagination";
import type { ApplicationInterviewContext } from "@/components/application-interview-actions";
import type {
  ApplicationFilters as ApplicationFiltersValue,
  ApplicationListItem,
} from "@/lib/applications/types";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    title: "投递岗位",
    paginationAria: "岗位列表分页",
    tileTotal: "全部投递",
    tileTotalNote: (rejected: number) => `已拒绝 ${rejected}`,
    tilePending: "待跟进",
    tilePendingNote: "仍停留在「已投递」",
    tileInterviewing: "面试中",
    tileInterviewingNote: "笔试到 HR 面之间",
    tileOffer: "Offer",
    tileOfferNote: "当前处于 Offer 阶段",
  },
  en: {
    title: "Applications",
    paginationAria: "Applications pagination",
    tileTotal: "All applications",
    tileTotalNote: (rejected: number) => `${rejected} rejected`,
    tilePending: "To follow up",
    tilePendingNote: "Still at “Applied”",
    tileInterviewing: "Interviewing",
    tileInterviewingNote: "From assessment to HR round",
    tileOffer: "Offer",
    tileOfferNote: "Currently at the offer stage",
  },
});

type Texts = (typeof messages)["zh-CN"];

function applicationPageHref(filters: ApplicationFiltersValue, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sortBy !== "updatedAt") params.set("sortBy", filters.sortBy);
  if (filters.sortDir !== "desc") params.set("sortDir", filters.sortDir);
  if (filters.pageSize !== 12) params.set("pageSize", String(filters.pageSize));
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/applications?${query}` : "/applications";
}

/**
 * 投递页的呈现层。本地版（服务端取数）和体验版（浏览器取数）
 * 渲染同一个组件——界面一致不靠约定靠结构。
 * 版式：四张指标卡（全部 / 待跟进 / 面试中 / Offer）→ 一张卡装筛选条、表格、分页。
 */

const INTERVIEWING: ApplicationStage[] = ["assessment", "first_interview", "second_interview", "third_interview", "hr_interview"];

function tilesOf(stats: { total: number; stageCounts: Record<ApplicationStage, number> }, t: Texts) {
  const interviewing = INTERVIEWING.reduce((sum, stage) => sum + (stats.stageCounts[stage] ?? 0), 0);
  return [
    { label: t.tileTotal, value: stats.total, note: t.tileTotalNote(stats.stageCounts.rejected ?? 0) },
    { label: t.tilePending, value: stats.stageCounts.applied ?? 0, note: t.tilePendingNote, tone: accentIf(stats.stageCounts.applied ?? 0) },
    { label: t.tileInterviewing, value: interviewing, note: t.tileInterviewingNote, tone: toneIf(interviewing, "info") },
    { label: t.tileOffer, value: stats.stageCounts.offer ?? 0, note: t.tileOfferNote, tone: toneIf(stats.stageCounts.offer ?? 0, "success") },
  ];
}
export function ApplicationsView({
  filters,
  applications,
  sources,
  stats,
  interviewContext,
  newApplication,
  table,
}: {
  filters: ApplicationFiltersValue;
  applications: {
    items: ApplicationListItem[];
    page: number;
    total: number;
    totalPages: number;
  };
  sources: string[];
  /** 全量阶段统计（不受筛选影响），有就在顶部放四张指标卡。 */
  stats?: { total: number; stageCounts: Record<ApplicationStage, number> };
  interviewContext: ApplicationInterviewContext | null;
  /** 体验版在此注入浏览器动作。 */
  newApplication?: Pick<
    NonNullable<ComponentProps<typeof NewApplicationModal>>,
    "action"
  >;
  table?: Pick<
    ComponentProps<typeof ApplicationsTable>,
    "editActionFor" | "deleteActionFor"
  >;
}) {
  const t = useMessages(messages);
  return (
    <>
      <PageHeader
        actions={
          <>
            <NewApplicationModal {...newApplication} />
            <SyncBossButton />
          </>
        }
        title={t.title}
      />
      {stats ? <StatTiles tiles={tilesOf(stats, t)} /> : null}
      <Card className="grid gap-4 p-4 sm:p-5">
        <ApplicationFilters filters={filters} sources={sources} />
        <ApplicationsTable
          applications={applications.items}
          interviewContext={interviewContext}
          {...table}
        />
        <ListPagination
          ariaLabel={t.paginationAria}
          hrefForPage={(page) => applicationPageHref(filters, page)}
          page={applications.page}
          total={applications.total}
          totalPages={applications.totalPages}
        />
      </Card>
    </>
  );
}
