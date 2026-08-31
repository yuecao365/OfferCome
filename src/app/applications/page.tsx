import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { ApplicationsView } from "@/components/applications-view";
import { TrialApplicationsPage } from "@/components/trial/pages/trial-applications-page";
import {
  getApplicationFilterOptions,
  getApplications,
} from "@/lib/applications/queries";
import { parseApplicationFilters } from "@/lib/applications/types";
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
      <ApplicationsView
        applications={applications}
        filters={filters}
        interviewContext={{
          resumeProjects,
          transcriptionConfigured: isAiTaskConfigured(transcriptionConfig),
        }}
        sources={options.sources}
      />
    </AppShell>
  );
}
