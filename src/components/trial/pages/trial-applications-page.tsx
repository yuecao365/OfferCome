"use client";

import { useSearchParams } from "next/navigation";

import { NewApplicationModal } from "@/components/application-modals";
import { ApplicationFilters } from "@/components/application-filters";
import { ApplicationsTable } from "@/components/applications-table";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { SyncBossButton } from "@/components/sync-boss-button";
import { parseApplicationFilters } from "@/lib/applications/types";
import {
  createTrialApplication,
  deleteTrialApplication,
  updateTrialApplication,
} from "@/lib/trial/application-actions";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";
import { applicationSources, queryApplications } from "@/lib/trial/workspace";

/**
 * 体验版的投递页：与本地版同一套组件、同一套筛选语义，唯一的差别是
 * 数据来自浏览器工作台、动作写回浏览器工作台。
 */
export function TrialApplicationsPage() {
  const searchParams = useSearchParams();
  const workspace = useTrialWorkspace();

  const filters = parseApplicationFilters(
    Object.fromEntries(searchParams.entries()),
  );
  // 首帧（SSR/未水合）还读不到浏览器数据，渲染空列表占位，水合后立即补齐。
  const applications = workspace
    ? queryApplications(workspace, filters)
    : { items: [], page: 1, total: 0, totalPages: 1 };

  return (
    <>
      <PageHeader
        actions={
          <>
            <NewApplicationModal action={createTrialApplication} />
            <SyncBossButton />
          </>
        }
        description="集中管理投递记录，按公司、岗位、流程状态、来源和时间快速筛选。"
        eyebrow="求职管理"
        title="投递岗位"
      />
      <ApplicationFilters
        filters={filters}
        sources={workspace ? applicationSources(workspace) : []}
      />
      <ApplicationsTable
        applications={applications.items}
        deleteActionFor={(id) => async () => deleteTrialApplication(id)}
        editActionFor={(id) => (state, formData) =>
          updateTrialApplication(id, state, formData)}
        interviewContext={null}
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
