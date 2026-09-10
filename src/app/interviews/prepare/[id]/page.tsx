import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { InterviewPrepareView } from "@/components/interviews/interview-prepare-view";
import { TrialPreparePage } from "@/components/trial/pages/trial-prepare-page";
import { getInterviewPrepareData } from "@/lib/interviews/prepare";
import { isTrialMode } from "@/lib/runtime-mode";

export default async function InterviewPreparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isTrialMode()) {
    return (
      <AppShell active="interviews" subActive="interviews-history">
        <TrialPreparePage id={id} />
      </AppShell>
    );
  }

  await connection();
  const data = await getInterviewPrepareData(id);
  if (!data) notFound();

  return (
    <AppShell active="interviews" subActive="interviews-history">
      <InterviewPrepareView data={data} />
    </AppShell>
  );
}
