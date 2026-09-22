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

function tilesOf(stats: { total: number; stageCounts: Record<ApplicationStage, number> }) {
  const interviewing = INTERVIEWING.reduce((sum, stage) => sum + (stats.stageCounts[stage] ?? 0), 0);
  return [
    { label: "全部投递", value: stats.total, note: `已拒绝 ${stats.stageCounts.rejected ?? 0}` },
    { label: "待跟进", value: stats.stageCounts.applied ?? 0, note: "仍停留在「已投递」", tone: accentIf(stats.stageCounts.applied ?? 0) },
    { label: "面试中", value: interviewing, note: "笔试到 HR 面之间", tone: toneIf(interviewing, "info") },
    { label: "Offer", value: stats.stageCounts.offer ?? 0, note: "当前处于 Offer 阶段", tone: toneIf(stats.stageCounts.offer ?? 0, "success") },
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
  return (
    <>
      <PageHeader
        actions={
          <>
            <NewApplicationModal {...newApplication} />
            <SyncBossButton />
          </>
        }
        title="投递岗位"
      />
      {stats ? <StatTiles tiles={tilesOf(stats)} /> : null}
      <Card className="grid gap-4 p-4 sm:p-5">
        <ApplicationFilters filters={filters} sources={sources} />
        <ApplicationsTable
          applications={applications.items}
          interviewContext={interviewContext}
          {...table}
        />
        <ListPagination
          ariaLabel="岗位列表分页"
          hrefForPage={(page) => applicationPageHref(filters, page)}
          page={applications.page}
          total={applications.total}
          totalPages={applications.totalPages}
        />
      </Card>
    </>
  );
}
