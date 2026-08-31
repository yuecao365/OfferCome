"use client";

import { useSearchParams } from "next/navigation";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { TrialGettingStartedCard } from "@/components/trial/trial-getting-started-card";
import { parseApplicationTrendRange } from "@/lib/applications/analytics";
import {
  applicationStats,
  interviewStats,
  upcomingInterviews,
} from "@/lib/trial/workspace-interviews";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 体验版的数据概览页：与本地版渲染同一个 DashboardView，
 * 统计全部来自浏览器工作台 + 共享纯函数。
 */
export function TrialDashboardPage() {
  const searchParams = useSearchParams();
  const workspace = useTrialWorkspace();
  const trendRange = parseApplicationTrendRange(searchParams.get("trend") ?? undefined);

  if (!workspace) {
    // 首帧（SSR/未水合）还读不到浏览器数据，水合后立即补齐。
    return null;
  }

  return (
    <DashboardView
      gettingStarted={<TrialGettingStartedCard workspace={workspace} />}
      homeHref="/homepage"
      interviewStats={interviewStats(workspace)}
      stats={applicationStats(workspace, trendRange)}
      trendRange={trendRange}
      upcomingInterviews={upcomingInterviews(workspace)}
    />
  );
}
