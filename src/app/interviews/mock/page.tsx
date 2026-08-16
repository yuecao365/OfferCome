import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { MockInterviewSetup } from "@/components/interviews/mock-interview-setup";
import { InterviewDeleteButton } from "@/components/interviews/interview-delete-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db";
import { getRecentMockInterviews } from "@/lib/mock-interviews/queries";
import { mockInterviewDeleteConfirmMessage } from "@/lib/mock-interviews/types";
import { getResumes } from "@/lib/resumes/queries";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";
import { resolveMockInterviewSeed } from "@/lib/mock-interviews/seeds";

function statusLabel(status: string): string {
  if (status === "completed") return "已完成";
  if (status === "ready_to_evaluate" || status === "evaluating") return "评分中";
  if (status === "awaiting_jd_review") return "待补充岗位信息";
  if (status === "generation_failed") return "生成未完成";
  return "进行中";
}

function firstParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function MockInterviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  const jobPrefill =
    companyName || jobTitle
      ? {
          id: null,
          companyName: companyName ?? "",
          jobTitle: jobTitle ?? "",
          jobUrl: "",
          jobDescription: "",
        }
      : null;

  return (
    <AppShell active="interviews" subActive="interviews-mock">
      <PageHeader
        description="结合目标岗位描述、所选简历、历史面试和已确认画像生成逐题训练，完成后获得有证据的评分与建议。"
        eyebrow="面试训练"
        title="AI 模拟面试"
      />

      {resumes.length > 0 ? (
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
          textConfigured={isAiTaskConfigured(textConfig)}
          transcriptionConfigured={isAiTaskConfigured(transcriptionConfig)}
          resumes={resumes.map((resume) => ({
            id: resume.id,
            name: resume.originalName,
            isDefault: resume.isDefault,
          }))}
          seed={seed}
        />
      ) : (
        <EmptyState
          action={<ButtonLink href="/resumes">前往简历中心</ButtonLink>}
          description="模拟面试需要从已保存的简历中提取项目与经历。"
          title="请先上传一份简历"
        />
      )}

      <section className="grid gap-3">
        <h2 className="text-base font-semibold tracking-normal">最近的模拟面试</h2>
        {recent.length === 0 ? (
          <EmptyState className="min-h-40" description="配置目标岗位和岗位描述后，开始第一次针对性训练。" title="还没有模拟面试记录" />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {recent.map((session) => (
              <div className="flex items-center gap-2" key={session.id}>
                <Link
                  className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3.5 hover:bg-surface-subtle"
                  href={`/interviews/mock/${session.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {session.interview.companyName} · {session.interview.jobTitle}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      已回答 {Math.min(session.currentQuestionIndex, session.questionCount)}/{session.questionCount} 题
                      {session.totalScore !== null ? ` · ${session.totalScore} 分` : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      session.status === "completed"
                        ? "success"
                        : session.status === "awaiting_jd_review" ||
                            session.status === "generation_failed"
                          ? "warning"
                          : "info"
                    }
                  >
                    {statusLabel(session.status)}
                  </Badge>
                </Link>
                <div className="shrink-0 pr-3">
                  <InterviewDeleteButton
                    confirmMessage={mockInterviewDeleteConfirmMessage(session.status)}
                    id={session.interviewId}
                  />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </AppShell>
  );
}
