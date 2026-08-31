import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { InterviewReviewView } from "@/components/interviews/interview-review-view";
import { TrialReviewPage } from "@/components/trial/pages/trial-review-page";
import { getInterviewReviewPageData } from "@/lib/interviews/queries";
import { parseInterviewReviewFilters } from "@/lib/interviews/review";
import { isTrialMode } from "@/lib/runtime-mode";

export default async function InterviewReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isTrialMode()) {
    return (
      <AppShell active="interviews" subActive="interviews-review">
        <Suspense>
          <TrialReviewPage />
        </Suspense>
      </AppShell>
    );
  }

  await connection();

  const filters = parseInterviewReviewFilters(await searchParams);
  const data = await getInterviewReviewPageData(filters);

  return (
    <AppShell active="interviews" subActive="interviews-review">
      <InterviewReviewView data={data} filters={filters} />
    </AppShell>
  );
}
