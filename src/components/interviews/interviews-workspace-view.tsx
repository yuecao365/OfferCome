import { ArrowRight, CheckCircle2, Gauge, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { InterviewConversionOverview } from "@/components/interviews/interview-conversion-overview";
import { InterviewHistorySummary } from "@/components/interviews/interview-history-summary";
import { NewInterviewModal } from "@/components/interviews/interview-modals";
import { InterviewStageFlow } from "@/components/interviews/interview-stage-flow";
import { InterviewWorkspaceLinks } from "@/components/interviews/interview-workspace-links";
import { UpcomingInterviewsCard } from "@/components/interviews/upcoming-interviews-card";
import { PageHeader } from "@/components/page-header";
import { StatHero } from "@/components/stat-hero";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCareerFlowSnapshot } from "@/lib/applications/analytics";
import type { ApplicationStage } from "@/lib/applications/types";
import type { CandidateProfileContextInsight } from "@/lib/candidate-profile/types";
import { formatDate } from "@/lib/format/date";
import {
  buildInterviewConversionMetrics,
  buildInterviewHistorySummary,
  buildInterviewStageProgress,
  mergeInterviewRoundEvidence,
} from "@/lib/interviews/analytics";
import {
  roundLabel,
  statusLabel,
  type InterviewRound,
  type InterviewStatus,
  type RealInterviewRoundCounts,
  type RealInterviewStatusCounts,
  type ResumeProjectOption,
} from "@/lib/interviews/types";
import type { UpcomingInterviews } from "@/lib/interviews/upcoming";

/** 与本地版 getInterviewWorkspaceData / 体验版 interviewWorkspaceOverview 的共同返回形状。 */
export type InterviewWorkspaceOverview = {
  recent: {
    id: string;
    mockSessionId: string | null;
    kind: "mock" | "real";
    companyName: string;
    jobTitle: string;
    status: InterviewStatus;
    round: InterviewRound | null;
    occurredAt: Date;
    questionCount: number;
    score: number | null;
  }[];
  completedMockCount: number;
  averageMockScore: number | null;
  realInterviewCounts: RealInterviewStatusCounts;
  realInterviewRoundCounts: RealInterviewRoundCounts;
};

/**
 * 面试工作台的呈现层：统计推导全部走纯函数，本地版与体验版
 * 只是把不同来源的数据喂进同一个组件。
 */
export function InterviewsWorkspaceView({
  workspace,
  stageCounts,
  insights,
  upcomingInterviews,
  resumeProjects,
  transcriptionConfigured,
  newInterview,
}: {
  workspace: InterviewWorkspaceOverview;
  stageCounts: Record<ApplicationStage, number>;
  insights: CandidateProfileContextInsight[];
  upcomingInterviews: UpcomingInterviews;
  resumeProjects: ResumeProjectOption[];
  transcriptionConfigured: boolean;
  /** 体验版在此注入浏览器动作与导入开关。 */
  newInterview?: Pick<
    ComponentProps<typeof NewInterviewModal>,
    "action" | "draftImportEnabled"
  >;
}) {
  const flow = buildCareerFlowSnapshot(stageCounts);
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
    insights,
  });

  return (
    <>
      <PageHeader
        actions={
          <NewInterviewModal
            resumeProjects={resumeProjects}
            transcriptionConfigured={transcriptionConfigured}
            {...newInterview}
          />
        }
        description="集中管理面试记录、模拟训练与复盘，并用真实证据持续完善能力画像。"
        eyebrow="面试训练"
        title="面试工作台"
      />

      <UpcomingInterviewsCard interviews={upcomingInterviews} />

      <StatHero
        action={
          <ButtonLink href="/interviews/mock">
            开始 AI 模拟面试
            <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        }
        eyebrow="主要训练入口"
        label="真实面试记录"
        note="使用真实岗位描述、已保存简历、历史面试和已确认画像生成针对性问题。"
        tiles={[
          { icon: Sparkles, label: "模拟训练", value: workspace.completedMockCount },
          { icon: CheckCircle2, label: "当前 Offer", value: progress.offer },
          {
            icon: Gauge,
            label: "模拟均分",
            suffix: "分",
            value: Math.round(workspace.averageMockScore ?? 0),
          },
        ]}
        value={workspace.realInterviewCounts.total}
      />

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
                  className="group relative -mx-2 flex flex-col gap-3 rounded-lg px-2 py-4 transition-colors duration-200 ease-app hover:bg-surface-subtle sm:flex-row sm:items-center sm:justify-between"
                  href={interview.mockSessionId ? `/interviews/mock/${interview.mockSessionId}` : "/interviews/history"}
                  key={interview.id}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  />
                  <div className="min-w-0 pl-2">
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
    </>
  );
}
