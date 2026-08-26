import "server-only";

import { prisma } from "@/lib/db";

import type { synthesizeCandidateInsights } from "./agent";
import { detectInsightConflict } from "./conflict";
import { isTentativeProfileMetric } from "./rules";
import { validateSynthesis, type ProfileView } from "./synthesis";
import { PROFILE_ASSESSMENT_VERSION } from "./types";

/**
 * 画像流水线第三相：把指标、洞察和快照写库。
 *
 * 整段在一个事务里：指标、洞察、证据、快照必须一起生效，
 * 否则页面会读到半新半旧的画像。用户锁定的洞察永远不动。
 */

function normalizedInsightKey(dimension: string, kind: string, title: string): string {
  const normalizedTitle = title
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  return `${dimension}:${kind}:${normalizedTitle || "insight"}`;
}

export async function persistProfileViews(
  views: ProfileView[],
  syntheses: Map<string, Awaited<ReturnType<typeof synthesizeCandidateInsights>>>,
  revision: number,
) {
  let insightCount = 0;
  await prisma.$transaction(async (tx) => {
    for (const view of views) {
      for (const metric of view.metrics) {
        await tx.candidateProfileMetric.upsert({
          where: { roleKey_dimension: { roleKey: view.roleKey, dimension: metric.dimension } },
          create: {
            roleKey: view.roleKey,
            dimension: metric.dimension,
            level: metric.level,
            levelLabel: metric.levelLabel,
            trend: metric.trend,
            evidenceConfidence: metric.evidenceConfidence,
            confidenceLabel: metric.confidenceLabel,
            interviewCount: metric.interviewCount,
            realInterviewCount: metric.realInterviewCount,
            evidenceCount: metric.evidenceCount,
          },
          update: {
            level: metric.level,
            levelLabel: metric.levelLabel,
            trend: metric.trend,
            evidenceConfidence: metric.evidenceConfidence,
            confidenceLabel: metric.confidenceLabel,
            interviewCount: metric.interviewCount,
            realInterviewCount: metric.realInterviewCount,
            evidenceCount: metric.evidenceCount,
          },
        });
      }

      const synthesized = syntheses.get(view.roleKey);
      const valid = synthesized ? validateSynthesis(synthesized.synthesis, view.observations) : [];
      await tx.candidateInsight.deleteMany({
        where: { roleKey: view.roleKey, isUserLocked: false },
      });
      const metricByDimension = new Map(view.metrics.map((item) => [item.dimension, item]));
      const preservedKeys = await tx.candidateInsight.findMany({
        where: { roleKey: view.roleKey },
        select: { normalizedKey: true },
      });
      const seenKeys = new Set(preservedKeys.map((item) => item.normalizedKey));
      for (const insight of valid) {
        const metric = metricByDimension.get(insight.dimension);
        // 1 场即可产出洞察；数据少时不是不给，而是标注为"初步印象"（tentative）。
        // tentative 洞察只做展示，不进入模拟面试的出题上下文（那边只取 active）。
        if (!metric || metric.interviewCount < 1) continue;
        const insightStatus = isTentativeProfileMetric(metric.interviewCount)
          ? "tentative"
          : "active";
        const normalizedKey = normalizedInsightKey(insight.dimension, insight.kind, insight.title);
        if (seenKeys.has(normalizedKey)) continue;
        seenKeys.add(normalizedKey);
        const hasConflict = detectInsightConflict({
          evidence: insight.evidence.map(({ polarity }) => ({ polarity })),
          interviewScores: metric.points.map(({ interviewId, score }) => ({
            interviewId,
            score,
          })),
        });
        const created = await tx.candidateInsight.create({
          data: {
            roleKey: view.roleKey,
            dimension: insight.dimension,
            kind: insight.kind,
            title: insight.title,
            statement: insight.statement,
            normalizedKey,
            confidence: metric.evidenceConfidence,
            level: metric.level,
            levelLabel: metric.levelLabel,
            trend: metric.trend,
            confidenceLabel: metric.confidenceLabel,
            status: insightStatus,
            hasConflict,
          },
        });
        await tx.candidateInsightEvidence.createMany({
          data: insight.evidence.map(({ observation, polarity }) => ({
            insightId: created.id,
            interviewId: observation.interviewId,
            questionId: observation.questionId,
            observationId: observation.id,
            polarity,
            sourceKind: observation.sourceType,
            excerpt: observation.evidenceExcerpt,
            weight: observation.sourceWeight,
          })),
        });
        insightCount += 1;
      }

      const activeInsightIds = await tx.candidateInsight.findMany({
        where: { roleKey: view.roleKey, status: "active" },
        select: { id: true },
      });
      await tx.candidateProfileSnapshot.upsert({
        where: { revision_roleKey: { revision, roleKey: view.roleKey } },
        create: {
          revision,
          roleKey: view.roleKey,
          metricsJson: JSON.stringify(view.metrics),
          insightIdsJson: JSON.stringify(activeInsightIds.map((item) => item.id)),
          assessmentVersion: PROFILE_ASSESSMENT_VERSION,
        },
        update: {
          metricsJson: JSON.stringify(view.metrics),
          insightIdsJson: JSON.stringify(activeInsightIds.map((item) => item.id)),
          assessmentVersion: PROFILE_ASSESSMENT_VERSION,
        },
      });
    }
  });
  return insightCount;
}
