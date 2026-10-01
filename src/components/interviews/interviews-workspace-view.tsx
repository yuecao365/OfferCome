"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { InterviewConversionOverview } from "@/components/interviews/interview-conversion-overview";
import { InterviewHistorySummary } from "@/components/interviews/interview-history-summary";
import { MockTag } from "@/components/interviews/interview-list";
import { NewInterviewModal } from "@/components/interviews/interview-modals";
import { InterviewStageFlow } from "@/components/interviews/interview-stage-flow";
import { InterviewWorkspaceLinks } from "@/components/interviews/interview-workspace-links";
import { UpcomingInterviewsCard } from "@/components/interviews/upcoming-interviews-card";
import { PageHeader } from "@/components/page-header";
import { StatTiles, toneIf } from "@/components/stat-tiles";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCareerFlowSnapshot } from "@/lib/applications/analytics";
import type { ApplicationStage } from "@/lib/applications/types";
import type { CandidateProfileContextInsight } from "@/lib/candidate-profile/types";
import { formatDate } from "@/lib/format/date";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import {
  buildInterviewConversionMetrics,
  buildInterviewHistorySummary,
  buildInterviewStageProgress,
  mergeInterviewRoundEvidence,
} from "@/lib/interviews/analytics";
import {
  INTERVIEW_STATUS_LABELS_I18N,
  roundLabel,
  type InterviewRound,
  type InterviewStatus,
  type RealInterviewRoundCounts,
  type RealInterviewStatusCounts,
  type ResumeProjectOption,
} from "@/lib/interviews/types";
import type { UpcomingInterviews } from "@/lib/interviews/upcoming";

const messages = defineMessages({
  "zh-CN": {
    title: "面试工作台",
    realLabel: "真实面试记录",
    realNote: "已记录并可用于复盘与画像的真实面试。",
    startMock: "开始 AI 模拟面试",
    mockLabel: "模拟训练",
    mockNote: "已完成的模拟面试",
    offerLabel: "当前 Offer",
    offerNote: "处于 Offer 阶段的岗位",
    averageLabel: "模拟均分",
    averageSuffix: "分",
    averageNote: "已完成模拟面试的平均总分",
    stageMap: "面试进程地图",
    conversionTitle: "转化与训练表现",
    conversionDescription: "所有百分比均展示明确分子、分母；样本不足时不生成百分比。",
    recent: "最近面试",
    noRecent: "还没有面试记录。",
    questionCount: (n: number) => `${n} 个问题`,
    score: (n: number) => ` · ${n} 分`,
  },
  en: {
    title: "Interview workspace",
    realLabel: "Real interview records",
    realNote: "Real interviews recorded and available for review and your profile.",
    startMock: "Start an AI mock interview",
    mockLabel: "Mock sessions",
    mockNote: "Completed mock interviews",
    offerLabel: "Current offers",
    offerNote: "Roles at the offer stage",
    averageLabel: "Mock average",
    averageSuffix: "pts",
    averageNote: "Average total score of completed mock interviews",
    stageMap: "Interview pipeline",
    conversionTitle: "Conversion and practice performance",
    conversionDescription: "Every percentage shows its numerator and denominator; none is shown when there isn't enough data.",
    recent: "Recent interviews",
    noRecent: "No interview records yet.",
    questionCount: (n: number) => `${n} question${n === 1 ? "" : "s"}`,
    score: (n: number) => ` · ${n} pts`,
  },
});

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
  const locale = useLocale();
  const t = useMessages(messages);
  const flow = buildCareerFlowSnapshot(stageCounts);
  const applicationProgress = buildInterviewStageProgress(flow);
  const progress = mergeInterviewRoundEvidence(
    applicationProgress,
    workspace.realInterviewRoundCounts,
  );
  const conversionMetrics = buildInterviewConversionMetrics(
    applicationProgress,
    workspace.realInterviewCounts,
    locale,
  );
  const historySummary = buildInterviewHistorySummary({
    realInterviewCounts: workspace.realInterviewCounts,
    completedMockCount: workspace.completedMockCount,
    averageMockScore: workspace.averageMockScore,
    progress,
    insights,
  }, locale);

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
        title={t.title}
      />

      <UpcomingInterviewsCard interviews={upcomingInterviews} />

      <StatTiles
        tiles={[
          {
            label: t.realLabel,
            value: workspace.realInterviewCounts.total,
            note: t.realNote,
            action: (
              <ButtonLink href="/interviews/mock" size="sm">
                {t.startMock}
                <ArrowRight aria-hidden="true" className="size-4" />
              </ButtonLink>
            ),
          },
          { label: t.mockLabel, value: workspace.completedMockCount, note: t.mockNote },
          { label: t.offerLabel, value: progress.offer, note: t.offerNote, tone: toneIf(progress.offer, "success") },
          { label: t.averageLabel, suffix: t.averageSuffix, value: Math.round(workspace.averageMockScore ?? 0), note: t.averageNote },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t.stageMap}</CardTitle>
        </CardHeader>
        <CardContent>
          <InterviewStageFlow progress={progress} />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t.conversionTitle}</CardTitle>
            <CardDescription>{t.conversionDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <InterviewConversionOverview
              averageMockScore={workspace.averageMockScore}
              completedMockCount={workspace.completedMockCount}
              metrics={conversionMetrics}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="h-full">
            <InterviewHistorySummary {...historySummary} />
          </CardContent>
        </Card>
      </section>

      <InterviewWorkspaceLinks />

      <Card>
        <CardHeader>
          <CardTitle>{t.recent}</CardTitle>
        </CardHeader>
        <CardContent className="py-1">
          {workspace.recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t.noRecent}</p>
          ) : (
            <div className="divide-y divide-border">
              {workspace.recent.map((interview) => (
                <Link
                  className="group relative -mx-2 flex flex-col gap-2 rounded-control px-2 py-3 transition-colors duration-150 hover:bg-surface-subtle sm:flex-row sm:items-center sm:justify-between"
                  href={interview.mockSessionId ? `/interviews/mock/${interview.mockSessionId}` : "/interviews/history"}
                  key={interview.id}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  />
                  <div className="min-w-0 pl-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {interview.companyName} · {interview.jobTitle}
                      </p>
                      {interview.kind === "mock" ? <MockTag /> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(interview.occurredAt, "", locale)} · {roundLabel(interview.round, locale)} · {t.questionCount(interview.questionCount)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {INTERVIEW_STATUS_LABELS_I18N[locale][interview.status]}{interview.score !== null ? t.score(interview.score) : ""}
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
