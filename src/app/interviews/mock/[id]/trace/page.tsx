import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { MockInterviewTraceView } from "@/components/interviews/mock-interview-trace-view";
import { TrialMockTracePage } from "@/components/trial/pages/trial-mock-trace-page";
import { getMockInterviewTrace } from "@/lib/mock-interviews/queries";
import { isTrialMode } from "@/lib/runtime-mode";

/** 面试官的决策记录：只读 trace 页面，本地版读库，体验版读浏览器里的会话文档。 */
export default async function MockInterviewTracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isTrialMode()) {
    return (
      <AppShell active="interviews" subActive="interviews-mock">
        <TrialMockTracePage id={id} />
      </AppShell>
    );
  }
  await connection();
  const trace = await getMockInterviewTrace(id);
  if (!trace) notFound();

  return (
    <AppShell active="interviews" subActive="interviews-mock">
      <MockInterviewTraceView trace={trace} />
    </AppShell>
  );
}
