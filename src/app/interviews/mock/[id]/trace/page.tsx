import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { MockInterviewTraceView } from "@/components/interviews/mock-interview-trace-view";
import { getMockInterviewTrace } from "@/lib/mock-interviews/queries";
import { isTrialMode } from "@/lib/runtime-mode";

/** 面试官的决策记录：本地版专用的只读 trace 页面。 */
export default async function MockInterviewTracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (isTrialMode()) notFound();
  const { id } = await params;
  await connection();
  const trace = await getMockInterviewTrace(id);
  if (!trace) notFound();

  return (
    <AppShell active="interviews" subActive="interviews-mock">
      <MockInterviewTraceView trace={trace} />
    </AppShell>
  );
}
