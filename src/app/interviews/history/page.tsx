import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { InterviewHistoryView } from "@/components/interviews/interview-history-view";
import { TrialInterviewHistoryPage } from "@/components/trial/pages/trial-interview-history-page";
import {
  getInterviews,
  getResumeProjectOptions,
} from "@/lib/interviews/queries";
import { parseInterviewFilters } from "@/lib/interviews/types";
import { isTrialMode } from "@/lib/runtime-mode";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

export default async function InterviewHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isTrialMode()) {
    return (
      <AppShell active="interviews" subActive="interviews-history">
        <Suspense>
          <TrialInterviewHistoryPage />
        </Suspense>
      </AppShell>
    );
  }

  await connection();

  const filters = parseInterviewFilters(await searchParams);
  const [interviewPage, resumeProjects, transcriptionConfig] = await Promise.all([
    getInterviews(filters),
    getResumeProjectOptions(),
    getAiTaskConfig("transcription"),
  ]);

  return (
    <AppShell active="interviews" subActive="interviews-history">
      <InterviewHistoryView
        filters={filters}
        interviewPage={interviewPage}
        resumeProjects={resumeProjects}
        transcriptionConfigured={isAiTaskConfigured(transcriptionConfig)}
      />
    </AppShell>
  );
}
