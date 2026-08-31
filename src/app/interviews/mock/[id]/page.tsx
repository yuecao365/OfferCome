import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { MockInterviewSessionView } from "@/components/interviews/mock-interview-session-view";
import { TrialMockRoomPage } from "@/components/trial/pages/trial-mock-room-page";
import { getMockInterviewView } from "@/lib/mock-interviews/queries";
import { isTrialMode } from "@/lib/runtime-mode";

export default async function MockInterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (isTrialMode()) {
    return (
      <AppShell active="interviews" subActive="interviews-mock">
        <TrialMockRoomPage id={id} />
      </AppShell>
    );
  }

  await connection();
  const session = await getMockInterviewView(id);
  if (!session) notFound();

  return (
    <AppShell active="interviews" subActive="interviews-mock">
      <MockInterviewSessionView session={session} />
    </AppShell>
  );
}
