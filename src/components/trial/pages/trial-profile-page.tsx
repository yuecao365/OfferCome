"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";

import {
  CandidateProfileDashboard,
  type ProfileMetricValue,
  type ProfileSnapshotValue,
} from "@/components/candidate-profile/candidate-profile-dashboard";
import { RecentFeedbackCard } from "@/components/candidate-profile/recent-feedback-card";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseProfileDimension } from "@/lib/candidate-profile/types";
import { trialAiTokenDocument } from "@/lib/trial/browser-store";
import { createTrialProfileTransport } from "@/lib/trial/profile-actions";
import { useStoredDocument } from "@/lib/trial/stored-document";
import {
  trialProfile,
  trialProfileInsightViews,
  trialProfileMetrics,
  trialRoles,
} from "@/lib/trial/workspace-profile";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 体验版的能力画像页：渲染与本地版相同的 CandidateProfileDashboard，
 * 评估/总结走无状态 API，聚合与状态推导复用本地版纯函数；岗位视角与合并同样有。
 * 本地版由后台调度器驱动刷新，体验版由 AppShell 上的调度器在浏览器里跑。
 */
export function TrialProfilePage() {
  const workspace = useTrialWorkspace();
  const aiReady = useStoredDocument(trialAiTokenDocument) !== null;
  const transport = useMemo(() => createTrialProfileTransport(), []);

  if (!workspace) {
    // 首帧（SSR/未水合）还读不到浏览器数据，水合后立即补齐。
    return null;
  }

  const profile = trialProfile(workspace);
  const roles = trialRoles(workspace);
  const metricsByRole = new Map(
    ["all", ...roles.map((role) => role.key)].map((roleKey) => [roleKey, trialProfileMetrics(workspace, roleKey)] as const),
  );
  const metrics: ProfileMetricValue[] = [...metricsByRole.entries()].flatMap(([roleKey, aggregated]) =>
    aggregated.map((metric) => ({
      roleKey,
      dimension: metric.dimension,
      level: metric.level,
      levelLabel: metric.levelLabel,
      trend: metric.trend,
      evidenceConfidence: metric.evidenceConfidence,
      confidenceLabel: metric.confidenceLabel,
      interviewCount: metric.interviewCount,
      realInterviewCount: metric.realInterviewCount,
      evidenceCount: metric.evidenceCount,
    })),
  );
  const snapshots: ProfileSnapshotValue[] = profile.snapshots.map((snapshot) => ({
    id: `trial-snapshot-${snapshot.roleKey ?? "all"}-${snapshot.revision}`,
    revision: snapshot.revision,
    roleKey: snapshot.roleKey ?? "all",
    createdAt: snapshot.createdAt,
    metrics: snapshot.metrics.flatMap((metric) => {
      const dimension = parseProfileDimension(metric.dimension);
      return dimension
        ? [{ dimension, level: metric.level, levelLabel: metric.levelLabel }]
        : [];
    }),
  }));
  const insights = trialProfileInsightViews(workspace, metricsByRole);

  // 冷启动：有逐段反馈就先展示定性反馈卡（与本地版同一张卡）；连模型都没连时提示去设置页。
  const recentFeedback = workspace.interviews
    .filter((interview) => interview.kind === "mock" && interview.status === "completed")
    .slice(0, 3)
    .flatMap((interview) =>
      interview.questions.flatMap((question) =>
        question.evaluation
          ? [
              {
                questionId: question.id,
                question: question.question,
                companyName: interview.companyName,
                jobTitle: interview.jobTitle,
                areaName: null,
                strengths: question.evaluation.strengths.map((item) => item.point),
                weaknesses: question.evaluation.weaknesses,
              },
            ]
          : [],
      ),
    );

  return (
    <CandidateProfileDashboard
      coldStartCard={
        !aiReady ? (
          <Card className="grid gap-3 p-5 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">连接模型后自动生成画像</p>
            <p>
              能力画像由逐段评分推导并由 AI 归纳而成。在设置页连接你自己的
              模型服务后，打开本页会自动分析工作台里的面试记录。
            </p>
            <div>
              <ButtonLink href="/settings" size="sm">
                <Sparkles aria-hidden="true" className="size-4" />
                前往设置页
              </ButtonLink>
            </div>
          </Card>
        ) : recentFeedback.length > 0 ? (
          <RecentFeedbackCard items={recentFeedback} />
        ) : null
      }
      insights={insights}
      metrics={metrics}
      profileStatus={{
        status: "idle",
        phase: "idle",
        revision: profile.revision,
        completedCount: 0,
        totalCount: 0,
        lastRefreshedAt: profile.refreshedAt,
        lastError: null,
        needsFullRebuild: false,
      }}
      roles={roles.map((role) => ({ key: role.key, displayName: role.displayName }))}
      snapshots={snapshots}
      transport={transport}
    />
  );
}
