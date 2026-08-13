import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { MockInterviewRoom } from "@/components/interviews/mock-interview-room";
import { InterviewDeleteButton } from "@/components/interviews/interview-delete-button";
import { MockInterviewGenerationProgress } from "@/components/interviews/mock-interview-generation-progress";
import { MockInterviewJdReview } from "@/components/interviews/mock-interview-jd-review";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { getMockInterviewView } from "@/lib/mock-interviews/queries";
import { mockInterviewDeleteConfirmMessage } from "@/lib/mock-interviews/types";

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
          <>
            <ButtonLink href="/interviews/mock" variant="outline">
              返回模拟面试列表
            </ButtonLink>
            <InterviewDeleteButton
              confirmMessage={mockInterviewDeleteConfirmMessage(session.status)}
              id={session.interviewId}
              redirectTo="/interviews/mock"
            />
          </>
        }
        description="按顺序完成问题，系统会保存回答并在结束后生成基于证据的评估。"
        eyebrow="AI 模拟面试"
        title={`${session.companyName} · ${session.jobTitle}`}
      />
      {session.status === "awaiting_jd_review" && session.jobDescriptionReview ? (
        <MockInterviewJdReview
          jobTitle={session.jobTitle}
          review={session.jobDescriptionReview}
          sessionId={session.id}
        />
      ) : session.status === "generating" || session.status === "generation_failed" ? (
        <MockInterviewGenerationProgress
          initial={{
            status: session.status,
            generationPhase: session.generationPhase,
            errorCode: session.generationErrorCode,
            error: session.generationError,
            errorContext: session.generationErrorContext,
            questionCount: session.questionCount,
            jobTitle: session.jobTitle,
          }}
          sessionId={session.id}
        />
      ) : (
        <MockInterviewRoom initial={session} />
      )}
    </AppShell>
  );
}
