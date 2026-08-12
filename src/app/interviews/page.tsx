import {
  ArrowRight,
  MessagesSquare,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { InterviewConversionOverview } from "@/components/interviews/interview-conversion-overview";
import { InterviewHistorySummary } from "@/components/interviews/interview-history-summary";
import { NewInterviewModal } from "@/components/interviews/interview-modals";
import { InterviewStageFlow } from "@/components/interviews/interview-stage-flow";
import { InterviewWorkspaceLinks } from "@/components/interviews/interview-workspace-links";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCareerFlowSnapshot } from "@/lib/applications/analytics";
import { getApplicationStageSnapshot } from "@/lib/applications/queries";
import { getCandidateProfileContext } from "@/lib/candidate-profile/queries";
import {
  buildInterviewConversionMetrics,
  buildInterviewHistorySummary,
  buildInterviewStageProgress,
  mergeInterviewRoundEvidence,
} from "@/lib/interviews/analytics";
import {
  getInterviewWorkspaceData,
  getResumeProjectOptions,
} from "@/lib/interviews/queries";
import { roundLabel, statusLabel } from "@/lib/interviews/types";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

export default async function InterviewsPage() {
  await connection();
  const [resumeProjects, workspace, applicationSnapshot, profile, transcriptionConfig] = await Promise.all([
    getResumeProjectOptions(),
    getInterviewWorkspaceData(),
    getApplicationStageSnapshot(),
    getCandidateProfileContext(),
    getAiTaskConfig("transcription"),
  ]);
  const flow = buildCareerFlowSnapshot(applicationSnapshot.stageCounts);
  const applicationProgress = buildInterviewStageProgress(flow);
  const progress = mergeInterviewRoundEvidence(
    applicationProgress,
    workspace.realInterviewRoundCounts,
  );
  const conversionMetrics = buildInterviewConversionMetrics(
    applicationProgress,
    workspace.realInterviewCounts,
  );
  const historySummary = buildInterviewHistorySummary({
    realInterviewCounts: workspace.realInterviewCounts,
    completedMockCount: workspace.completedMockCount,
    averageMockScore: workspace.averageMockScore,
    progress,
    insights: profile.insights,
  });

  return (
    <AppShell active="interviews">
      <PageHeader
        actions={<NewInterviewModal resumeProjects={resumeProjects} transcriptionConfigured={isAiTaskConfigured(transcriptionConfig)} />}
        description="集中管理面试记录、模拟训练与复盘，并用真实证据持续完善能力画像。"
        eyebrow="面试训练"
        title="面试工作台"
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card className="overflow-hidden border-brand/25 bg-accent/40">
          <CardContent className="grid min-h-72 content-between gap-8 p-6 sm:p-8">
            <div>
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand text-brand-foreground">
                <Sparkles aria-hidden="true" className="size-5" />
              </span>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-brand">主要训练入口</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">开始 AI 模拟面试</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                使用真实 JD、已保存简历、历史面试和已确认画像生成针对性问题。评分标准在答题结束前不会展示。
              </p>
            </div>
            <ButtonLink className="w-fit" href="/interviews/mock">
              配置模拟面试
              <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            emphasis
            icon={<MessagesSquare aria-hidden="true" className="size-4" />}
            label="真实面试记录"
            value={workspace.realInterviewCounts.total}
          />
          <MetricCard label="已完成模拟训练" value={workspace.completedMockCount} />
          <MetricCard label="当前 Offer" value={progress.offer} />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>面试进程地图</CardTitle>
          <CardDescription>查看岗位至少到达的面试轮次；流动高光表示当前存在可推进的后续路径。</CardDescription>
        </CardHeader>
        <CardContent>
          <InterviewStageFlow progress={progress} />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle>转化与训练表现</CardTitle>
            <CardDescription>所有百分比均展示明确分子、分母；样本不足时不生成百分比。</CardDescription>
          </CardHeader>
          <CardContent>
            <InterviewConversionOverview
              averageMockScore={workspace.averageMockScore}
              completedMockCount={workspace.completedMockCount}
              metrics={conversionMetrics}
            />
          </CardContent>
        </Card>

        <Card className="border-brand/20 bg-accent/25">
          <CardContent className="h-full p-6">
            <InterviewHistorySummary {...historySummary} />
          </CardContent>
        </Card>
      </section>

      <InterviewWorkspaceLinks />

      <Card>
        <CardHeader>
          <CardTitle>最近面试</CardTitle>
          <CardDescription>最近更新的真实或模拟面试记录。</CardDescription>
        </CardHeader>
        <CardContent className="py-1">
          {workspace.recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">还没有面试记录。</p>
          ) : (
            <div className="divide-y divide-border">
              {workspace.recent.map((interview) => (
                <Link
                  className="flex flex-col gap-3 py-4 transition-colors hover:bg-surface-subtle sm:flex-row sm:items-center sm:justify-between sm:px-2"
                  href={interview.mockSessionId ? `/interviews/mock/${interview.mockSessionId}` : "/interviews/history"}
                  key={interview.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {interview.companyName} · {interview.jobTitle}
                      </p>
                      <Badge tone={interview.kind === "mock" ? "brand" : "neutral"}>
                        {interview.kind === "mock" ? "AI 模拟" : "真实面试"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(interview.occurredAt)} · {roundLabel(interview.round)} · {interview.questionCount} 个问题
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {statusLabel(interview.status)}{interview.score !== null ? ` · ${interview.score} 分` : ""}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
