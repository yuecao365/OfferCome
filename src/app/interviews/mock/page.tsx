import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { MockInterviewSetup } from "@/components/interviews/mock-interview-setup";
import { MockInterviewsView } from "@/components/interviews/mock-interviews-view";
import { TrialMockPage } from "@/components/trial/pages/trial-mock-page";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db";
import { getRecentMockInterviews } from "@/lib/mock-interviews/queries";
import { resolveMockInterviewSeed } from "@/lib/mock-interviews/seeds";
import { getResumes } from "@/lib/resumes/queries";
import { isTrialMode } from "@/lib/runtime-mode";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

function firstParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function MockInterviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isTrialMode()) {
    return (
      <AppShell active="interviews" subActive="interviews-mock">
        <Suspense>
          <TrialMockPage />
        </Suspense>
      </AppShell>
    );
  }

  await connection();
  const params = await searchParams;
  const applicationId = firstParam(params.applicationId);
  const [resumes, recent, textConfig, transcriptionConfig, seed, application] =
    await Promise.all([
      getResumes(),
      getRecentMockInterviews(),
      getAiTaskConfig("text"),
      getAiTaskConfig("transcription"),
      resolveMockInterviewSeed({
        seedQuestionId: firstParam(params.seedQuestionId),
        seedInsightId: firstParam(params.seedInsightId),
      }),
      applicationId
        ? prisma.bossContact.findUnique({
            where: { id: applicationId },
            select: {
              id: true,
              companyName: true,
              jobTitle: true,
              jobUrl: true,
              jobDescription: true,
            },
          })
        : null,
    ]);
  const companyName = firstParam(params.companyName);
  const jobTitle = firstParam(params.jobTitle);
  // 岗位信息优先级：URL 显式带的公司/岗位 > seed 来源面试的岗位。
  const jobPrefill =
    companyName || jobTitle
      ? {
          id: null,
          companyName: companyName ?? "",
          jobTitle: jobTitle ?? "",
          jobUrl: "",
          jobDescription: "",
        }
      : seed?.job
        ? {
            id: seed.job.applicationId,
            companyName: seed.job.companyName,
            jobTitle: seed.job.jobTitle,
            jobUrl: seed.job.jobUrl,
            jobDescription: seed.job.jobDescription,
          }
        : null;

  return (
    <AppShell active="interviews" subActive="interviews-mock">
      <MockInterviewsView
        recent={recent.map((session) => ({
          id: session.id,
          interviewId: session.interviewId,
          status: session.status,
          currentQuestionIndex: session.currentQuestionIndex,
          questionCount: session.questionCount,
          totalScore: session.totalScore,
          companyName: session.interview.companyName,
          jobTitle: session.interview.jobTitle,
        }))}
        setup={
          resumes.length > 0 ? (
            <MockInterviewSetup
              application={
                application
                  ? {
                      id: application.id,
                      companyName: application.companyName,
                      jobTitle: application.jobTitle,
                      jobUrl: application.jobUrl ?? "",
                      jobDescription: application.jobDescription ?? "",
                    }
                  : // 没有投递关联时（例如从备战页发起）也尽量带上岗位信息。
                    jobPrefill
              }
              resumes={resumes.map((resume) => ({
                id: resume.id,
                name: resume.originalName,
                isDefault: resume.isDefault,
              }))}
              seed={seed}
              textConfigured={isAiTaskConfigured(textConfig)}
              transcriptionConfigured={isAiTaskConfigured(transcriptionConfig)}
            />
          ) : (
            <EmptyState
              action={<ButtonLink href="/resumes">前往简历中心</ButtonLink>}
              description="模拟面试需要从已保存的简历中提取项目与经历。"
              title="请先上传一份简历"
            />
          )
        }
      />
    </AppShell>
  );
}
