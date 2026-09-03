import type { ComponentProps } from "react";

import { NewApplicationModal } from "@/components/application-modals";
import { ApplicationFilters } from "@/components/application-filters";
import { ApplicationsTable } from "@/components/applications-table";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { SyncBossButton } from "@/components/sync-boss-button";
import type { ApplicationInterviewContext } from "@/components/application-interview-actions";
import type {
  ApplicationFilters as ApplicationFiltersValue,
  ApplicationListItem,
} from "@/lib/applications/types";

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
      <Pagination
        filters={filters}
        page={applications.page}
        total={applications.total}
        totalPages={applications.totalPages}
      />
    </>
  );
}
