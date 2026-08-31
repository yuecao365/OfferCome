import { Suspense } from "react";
import { connection } from "next/server";

import { NewApplicationModal } from "@/components/application-modals";
import { AppShell } from "@/components/app-shell";
import { ApplicationFilters } from "@/components/application-filters";
import { ApplicationsTable } from "@/components/applications-table";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { SyncBossButton } from "@/components/sync-boss-button";
import {
  getApplicationFilterOptions,
  getApplications,
} from "@/lib/applications/queries";
import { parseApplicationFilters } from "@/lib/applications/types";
import { TrialApplicationsPage } from "@/components/trial/pages/trial-applications-page";
import { getResumeProjectOptions } from "@/lib/interviews/queries";
import { isTrialMode } from "@/lib/runtime-mode";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 体验模式：同一套页面组件，数据换成访客浏览器里的工作台。
  if (isTrialMode()) {
    return (
      <AppShell active="applications">
        <Suspense>
          <TrialApplicationsPage />
        </Suspense>
      </AppShell>
    );
  }

  await connection();

  const filters = parseApplicationFilters(await searchParams);
  const [options, applications, resumeProjects, transcriptionConfig] =
    await Promise.all([
      getApplicationFilterOptions(),
      getApplications(filters),
      getResumeProjectOptions(),
      getAiTaskConfig("transcription"),
    ]);

  return (
    <AppShell active="applications">
      <PageHeader
        actions={
          <>
            <NewApplicationModal />
            <SyncBossButton />
          </>
        }
        description="集中管理投递记录，按公司、岗位、流程状态、来源和时间快速筛选。"
        eyebrow="求职管理"
        title="投递岗位"
      />
      <ApplicationFilters filters={filters} sources={options.sources} />
      <ApplicationsTable
        applications={applications.items}
        interviewContext={{
          resumeProjects,
          transcriptionConfigured: isAiTaskConfigured(transcriptionConfig),
        }}
      />
      <Pagination
        filters={filters}
        page={applications.page}
        total={applications.total}
        totalPages={applications.totalPages}
      />
    </AppShell>
  );
}
