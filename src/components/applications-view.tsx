import type { ComponentProps } from "react";

import { NewApplicationModal } from "@/components/application-modals";
import { ApplicationFilters } from "@/components/application-filters";
import { ApplicationsTable } from "@/components/applications-table";
import { PageHeader } from "@/components/page-header";
import { SyncBossButton } from "@/components/sync-boss-button";
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
 */
export function ApplicationsView({
  filters,
  applications,
  sources,
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
        description="集中管理投递记录，按公司、岗位、流程状态、来源和时间快速筛选。"
        title="投递岗位"
      />
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
    </>
  );
}
