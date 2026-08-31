import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { TrialProfilePage } from "@/components/trial/pages/trial-profile-page";
import { isTrialMode } from "@/lib/runtime-mode";
import { CandidateProfileDashboard } from "@/components/candidate-profile/candidate-profile-dashboard";
import {
  PROFILE_INSIGHT_KINDS,
  normalizeProfileDimension,
  normalizeProfileSourceType,
  type ProfileInsightKind,
} from "@/lib/candidate-profile/types";
import {
  getCandidateProfilePageData,
  getRecentQualitativeFeedback,
} from "@/lib/candidate-profile/queries";
import { RecentFeedbackCard } from "@/components/candidate-profile/recent-feedback-card";

function isKind(value: string): value is ProfileInsightKind {
  return (PROFILE_INSIGHT_KINDS as readonly string[]).includes(value);
}

export default async function CandidateProfilePage() {
  if (isTrialMode()) {
    return (
      <AppShell active="interviews" immersive subActive="interviews-profile">
        <TrialProfilePage />
      </AppShell>
    );
  }

  await connection();
  const [data, recentFeedback] = await Promise.all([
    getCandidateProfilePageData(),
    getRecentQualitativeFeedback(),
  ]);
  const insights = data.insights.flatMap((insight) => {
    const dimension = normalizeProfileDimension(insight.dimension);
    if (!dimension || !isKind(insight.kind)) return [];
    return [
      {
        id: insight.id,
        roleKey: insight.roleKey,
        dimension,
        kind: insight.kind,
        title: insight.title,
        statement: insight.statement,
        confidence: insight.confidence,
        level: insight.level,
        levelLabel: insight.levelLabel,
        trend: insight.trend,
        confidenceLabel: insight.confidenceLabel,
        status: insight.status,
        isUserLocked: insight.isUserLocked,
        hasConflict: insight.hasConflict,
        evidence: insight.evidence.map((evidence) => ({
          id: evidence.id,
          interviewId: evidence.interviewId,
          questionId: evidence.questionId,
          observationId: evidence.observationId,
          observationStatus: evidence.observation?.status ?? "active",
          polarity: evidence.polarity,
          excerpt: evidence.excerpt,
          sourceKind: normalizeProfileSourceType(
            evidence.sourceKind,
            evidence.interview.kind,
          ),
          companyName: evidence.interview.companyName,
          jobTitle: evidence.interview.jobTitle,
          question: evidence.question?.question ?? "原问题已删除",
          answer: evidence.question?.answer ?? "",
          interviewAt: evidence.interview.interviewedAt?.toISOString() ?? null,
        })),
      },
    ];
  });
  const metrics = data.metrics.flatMap((metric) => {
    const dimension = normalizeProfileDimension(metric.dimension);
    return dimension ? [{
      roleKey: metric.roleKey,
      dimension,
      level: metric.level,
      levelLabel: metric.levelLabel,
      trend: metric.trend,
      evidenceConfidence: metric.evidenceConfidence,
      confidenceLabel: metric.confidenceLabel,
      interviewCount: metric.interviewCount,
      realInterviewCount: metric.realInterviewCount,
      evidenceCount: metric.evidenceCount,
    }] : [];
  });
  const snapshots = data.snapshots.map((snapshot) => {
    let parsed: unknown = [];
    try { parsed = JSON.parse(snapshot.metricsJson); } catch { parsed = []; }
    const snapshotMetrics = Array.isArray(parsed) ? parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const dimension = typeof record.dimension === "string" ? normalizeProfileDimension(record.dimension) : null;
      return dimension ? [{
        dimension,
        level: typeof record.level === "number" ? record.level : null,
        levelLabel: typeof record.levelLabel === "string" ? record.levelLabel : "待积累",
      }] : [];
    }) : [];
    return {
      id: snapshot.id,
      revision: snapshot.revision,
      roleKey: snapshot.roleKey,
      createdAt: snapshot.createdAt.toISOString(),
      metrics: snapshotMetrics,
    };
  });

  return (
    <AppShell active="interviews" immersive subActive="interviews-profile">
      <CandidateProfileDashboard
        coldStartCard={
          recentFeedback.length > 0 ? (
            <RecentFeedbackCard items={recentFeedback} />
          ) : null
        }
        insights={insights}
        metrics={metrics}
        profileStatus={{
          status: data.state?.status ?? "idle",
          phase: data.state?.phase ?? "idle",
          revision: data.state?.revision ?? 0,
          completedCount: data.state?.completedCount ?? 0,
          totalCount: data.state?.totalCount ?? 0,
          lastRefreshedAt: data.state?.lastRefreshedAt?.toISOString() ?? null,
          lastError: data.state?.lastError ?? null,
          needsFullRebuild: data.state?.needsFullRebuild ?? false,
        }}
        roles={data.roleContexts.map((role) => ({ key: role.key, displayName: role.displayName }))}
        snapshots={snapshots}
      />
    </AppShell>
  );
}
