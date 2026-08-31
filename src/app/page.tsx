import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { GettingStartedCard } from "@/components/dashboard/getting-started-card";
import { TrialDashboardPage } from "@/components/trial/pages/trial-dashboard-page";
import { parseApplicationTrendRange } from "@/lib/applications/analytics";
import { getApplicationStats } from "@/lib/applications/queries";
import { getInterviewStats } from "@/lib/interviews/queries";
import { getUpcomingInterviews } from "@/lib/interviews/upcoming";
import { isDemoMode, isTrialMode } from "@/lib/runtime-mode";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isTrialMode()) {
    return (
      <AppShell active="overview">
        <Suspense>
          <TrialDashboardPage />
        </Suspense>
      </AppShell>
    );
  }

  await connection();
  const trendRange = parseApplicationTrendRange((await searchParams).trend);
  const [stats, interviewStats, upcomingInterviews] = await Promise.all([
    getApplicationStats({ trendRange }),
    getInterviewStats(),
    getUpcomingInterviews(),
  ]);

  return (
    <AppShell active="overview">
      <DashboardView
        gettingStarted={
          isDemoMode() ? null : (
            <GettingStartedCard hasApplications={stats.total > 0} />
          )
        }
        homeHref={isDemoMode() ? "/homepage" : "/"}
        interviewStats={interviewStats}
        stats={stats}
        trendRange={trendRange}
        upcomingInterviews={upcomingInterviews}
      />
    </AppShell>
  );
}
