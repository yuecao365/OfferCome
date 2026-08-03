import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { MockInterviewRoom } from "@/components/interviews/mock-interview-room";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { getMockInterviewView } from "@/lib/mock-interviews/queries";

export default async function MockInterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const session = await getMockInterviewView(id);
  if (!session) notFound();

  return (
    <AppShell active="interviews" subActive="interviews-mock">
      <PageHeader
        actions={
          <ButtonLink href="/interviews/mock" variant="outline">
            返回模拟面试列表
          </ButtonLink>
        }
        description="按顺序完成问题，系统会保存回答并在结束后生成基于证据的评估。"
        eyebrow="AI 模拟面试"
        title={`${session.companyName} · ${session.jobTitle}`}
      />
      <MockInterviewRoom initial={session} />
    </AppShell>
  );
}
