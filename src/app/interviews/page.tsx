import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { InterviewsWorkspaceView } from "@/components/interviews/interviews-workspace-view";
import { TrialInterviewsPage } from "@/components/trial/pages/trial-interviews-page";
import { getApplicationStageSnapshot } from "@/lib/applications/queries";
import { getCandidateProfileContext } from "@/lib/candidate-profile/queries";
import {
  getInterviewWorkspaceData,
  getResumeProjectOptions,
} from "@/lib/interviews/queries";
import { getUpcomingInterviews } from "@/lib/interviews/upcoming";
import { isTrialMode } from "@/lib/runtime-mode";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

export default async function InterviewsPage() {
  if (isTrialMode()) {
    return (
      <AppShell active="interviews">
        <Suspense>
          <TrialInterviewsPage />
        </Suspense>
      </AppShell>
    );
  }

  await connection();
  const [
    resumeProjects,
    workspace,
    applicationSnapshot,
    profile,
    transcriptionConfig,
    upcomingInterviews,
  ] = await Promise.all([
    getResumeProjectOptions(),
    getInterviewWorkspaceData(),
    getApplicationStageSnapshot(),
    getCandidateProfileContext(),
    getAiTaskConfig("transcription"),
    getUpcomingInterviews(),
  ]);

  return (
    <AppShell active="interviews">
      <InterviewsWorkspaceView
        insights={profile.insights}
        resumeProjects={resumeProjects}
        stageCounts={applicationSnapshot.stageCounts}
        transcriptionConfigured={isAiTaskConfigured(transcriptionConfig)}
        upcomingInterviews={upcomingInterviews}
        workspace={workspace}
      />
    </AppShell>
  );
}
