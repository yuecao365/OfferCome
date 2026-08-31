"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";

import {
  CandidateProfileDashboard,
  type ProfileMetricValue,
  type ProfileSnapshotValue,
} from "@/components/candidate-profile/candidate-profile-dashboard";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { normalizeProfileDimension } from "@/lib/candidate-profile/types";
import { trialAiTokenDocument } from "@/lib/trial/browser-store";
import {
  createTrialProfileTransport,
  refreshTrialProfile,
  shouldAutoRefreshTrialProfile,
} from "@/lib/trial/profile-actions";
import { useStoredDocument } from "@/lib/trial/stored-document";
import {
  trialProfile,
  trialProfileInsightViews,
  trialProfileMetrics,
} from "@/lib/trial/workspace-profile";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 体验版的能力画像页：渲染与本地版相同的 CandidateProfileDashboard，
 * 评估/总结走无状态 API，聚合与状态推导复用本地版纯函数。
 * 本地版由后台调度器驱动刷新，体验版改为打开页面时自动补齐。
 */
export function TrialProfilePage() {
  const workspace = useTrialWorkspace();
  const aiReady = useStoredDocument(trialAiTokenDocument) !== null;
  const transport = useMemo(() => createTrialProfileTransport(), []);

  // 有新的已完成面试且模型可用时自动跑一轮，与本地版"自动更新"语义一致。
  useEffect(() => {
    if (!workspace || !aiReady) return;
    if (shouldAutoRefreshTrialProfile()) {
      refreshTrialProfile().catch(() => {
        // 失败状态由表盘轮询展示，这里不用重复处理。
      });
    }
  }, [aiReady, workspace]);

  if (!workspace) {
    // 首帧（SSR/未水合）还读不到浏览器数据，水合后立即补齐。
    return null;
  }

  const profile = trialProfile(workspace);
  const aggregated = trialProfileMetrics(workspace);
  const metrics: ProfileMetricValue[] = aggregated.map((metric) => ({
    roleKey: "all",
    dimension: metric.dimension,
    level: metric.level,
    levelLabel: metric.levelLabel,
    trend: metric.trend,
    evidenceConfidence: metric.evidenceConfidence,
    confidenceLabel: metric.confidenceLabel,
    interviewCount: metric.interviewCount,
    realInterviewCount: metric.realInterviewCount,
    evidenceCount: metric.evidenceCount,
  }));
  const snapshots: ProfileSnapshotValue[] = profile.snapshots.map((snapshot) => ({
    id: `trial-snapshot-${snapshot.revision}`,
    revision: snapshot.revision,
    roleKey: "all",
    createdAt: snapshot.createdAt,
    metrics: snapshot.metrics.flatMap((metric) => {
      const dimension = normalizeProfileDimension(metric.dimension);
      return dimension
        ? [{ dimension, level: metric.level, levelLabel: metric.levelLabel }]
        : [];
    }),
  }));

  return (
    <CandidateProfileDashboard
      coldStartCard={
        aiReady ? null : (
          <Card className="grid gap-3 p-5 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">连接模型后自动生成画像</p>
            <p>
              能力画像由 AI 逐题评估已完成的面试并聚合而成。连接你自己的模型服务后，
              打开本页会自动分析工作台里的面试记录。
            </p>
            <div>
              <ButtonLink href="/trial" size="sm">
                <Sparkles aria-hidden="true" className="size-4" />
                去连接模型
              </ButtonLink>
            </div>
          </Card>
        )
      }
      insights={trialProfileInsightViews(workspace, aggregated)}
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
      roles={[]}
      snapshots={snapshots}
      transport={transport}
    />
  );
}
