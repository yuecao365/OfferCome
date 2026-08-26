import "server-only";

import { prisma } from "@/lib/db";

import { synthesizeCandidateInsights } from "./agent";
import {
  assessInterview,
  getCompletedInterviews,
  interviewSourceHash,
} from "./assessment";
import { persistProfileViews } from "./persist";
import { acquireProfileRefreshLease, ensureCandidateProfileState } from "./state";
import { buildProfileViews } from "./synthesis";
import { normalizeProfileDimension } from "./types";
import {
  PROFILE_AGGREGATION_VERSION,
  PROFILE_ASSESSMENT_VERSION,
  PROFILE_PROMPT_VERSION,
  PROFILE_STATE_ID,
} from "./types";

/**
 * 能力画像的编排入口。三相流水线各自独立成文件：
 *   assessment.ts —— 面试 → 能力观察（按 sourceHash 幂等）
 *   synthesis.ts  —— 观察 → 分维度指标与洞察校验
 *   persist.ts    —— 指标、洞察、快照落库
 *
 * 这里只负责租约、分批、状态机和失败回退。
 */

/** 一次刷新最多评估几场面试。超出的留给下一批，避免单次跑太久。 */
const ASSESSMENT_BATCH_SIZE = 3;

type RefreshResult =
  | {
      status: "success";
      revision: number;
      insightCount: number;
      completedCount: number;
      totalCount: number;
    }
  | { status: "processing"; completedCount: number; totalCount: number }
  | { status: "skipped"; reason: "not_due" | "running" | "clean" };

export async function refreshCandidateProfile({
  force = false,
}: { force?: boolean } = {}): Promise<RefreshResult> {
  const lease = await acquireProfileRefreshLease({ force });
  if (!lease.acquired) return { status: "skipped", reason: lease.reason };

  const state = await ensureCandidateProfileState();
  const interviews = await getCompletedInterviews();
  const hashes = new Map(interviews.map((item) => [item.id, interviewSourceHash(item)]));
  const current = await prisma.interviewAssessment.findMany({
    where: {
      assessmentVersion: PROFILE_ASSESSMENT_VERSION,
      status: "completed",
      OR: interviews.map((item) => ({ interviewId: item.id, sourceHash: hashes.get(item.id)! })),
    },
    select: { interviewId: true },
  });
  const currentIds = new Set(current.map((item) => item.interviewId));
  const pending = interviews.filter((item) => !currentIds.has(item.id));
  const run = await prisma.candidateProfileRun.create({
    data: {
      mode: force ? "manual" : "automatic",
      fullRebuild: lease.fullRebuild,
      promptVersion: PROFILE_PROMPT_VERSION,
      assessmentVersion: PROFILE_ASSESSMENT_VERSION,
      totalCount: interviews.length,
      completedCount: currentIds.size,
    },
  });

  try {
    for (const interview of pending.slice(0, ASSESSMENT_BATCH_SIZE)) {
      await assessInterview(interview, hashes.get(interview.id)!);
      currentIds.add(interview.id);
    }
    const completedCount = currentIds.size;
    if (completedCount < interviews.length) {
      await Promise.all([
        prisma.candidateProfileState.update({
          where: { id: PROFILE_STATE_ID },
          data: {
            status: "pending",
            phase: "assessment",
            completedCount,
            totalCount: interviews.length,
            dueAt: new Date(),
            leaseToken: null,
            leaseExpiresAt: null,
          },
        }),
        prisma.candidateProfileRun.update({
          where: { id: run.id },
          data: {
            status: "partial",
            phase: "assessment",
            completedCount,
            completedAt: new Date(),
          },
        }),
      ]);
      return { status: "processing", completedCount, totalCount: interviews.length };
    }

    const hasSnapshot = await prisma.candidateProfileSnapshot.findFirst({
      where: { assessmentVersion: PROFILE_ASSESSMENT_VERSION },
      select: { id: true },
    });
    const sourceChanged = Boolean(
      state.lastSourceAt && (!state.lastRefreshedAt || state.lastSourceAt > state.lastRefreshedAt),
    );
    if (pending.length === 0 && hasSnapshot && !sourceChanged && !lease.fullRebuild) {
      await Promise.all([
        prisma.candidateProfileState.update({
          where: { id: PROFILE_STATE_ID },
          data: { status: "idle", phase: "idle", leaseToken: null, leaseExpiresAt: null },
        }),
        prisma.candidateProfileRun.update({
          where: { id: run.id },
          data: { status: "completed", phase: "idle", completedCount, completedAt: new Date() },
        }),
      ]);
      return { status: "skipped", reason: "clean" };
    }

    await prisma.candidateProfileState.update({
      where: { id: PROFILE_STATE_ID },
      data: { phase: "synthesis", completedCount, totalCount: interviews.length },
    });
    const views = await buildProfileViews();
    const syntheses = new Map<string, Awaited<ReturnType<typeof synthesizeCandidateInsights>>>();
    let provider: string | null = null;
    let model: string | null = null;
    for (const view of views) {
      // 门槛下放：1 场面试即可合成"初步印象"（tentative 由合成器按 interviewCount 标注），
      // 冷启动阶段也要有可看的洞察，而不是整页留白。
      const eligibleMetrics = view.metrics.filter((metric) => metric.interviewCount >= 1);
      if (eligibleMetrics.length === 0) continue;
      const eligibleDimensions = new Set(eligibleMetrics.map((metric) => metric.dimension));
      const lockedInsights = await prisma.candidateInsight.findMany({
        where: { roleKey: view.roleKey, isUserLocked: true },
      });
      const synthesized = await synthesizeCandidateInsights({
        roleKey: view.roleKey,
        metrics: eligibleMetrics,
        observations: view.observations
          .filter((item) => eligibleDimensions.has(item.dimension))
          .slice(0, 120),
        lockedInsights,
      });
      provider = synthesized.provider;
      model = synthesized.model;
      syntheses.set(view.roleKey, synthesized);
    }

    const revision = state.revision + 1;
    const insightCount = await persistProfileViews(views, syntheses, revision);
    const completedAt = new Date();
    const summaryInsights = await prisma.candidateInsight.findMany({
      where: { roleKey: "all", status: "active", hasConflict: false },
      orderBy: [{ dimension: "asc" }, { confidence: "desc" }],
    });
    await Promise.all([
      prisma.candidateProfileState.update({
        where: { id: PROFILE_STATE_ID },
        data: {
          status: "idle",
          phase: "idle",
          revision,
          summaryJson: JSON.stringify(summaryInsights),
          lastProcessedAt: lease.sourceCutoff,
          lastRefreshedAt: completedAt,
          pendingSince: null,
          dueAt: null,
          needsFullRebuild: false,
          completedCount,
          totalCount: interviews.length,
          assessmentVersion: PROFILE_AGGREGATION_VERSION,
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      }),
      prisma.candidateProfileRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          phase: "snapshot",
          evidenceCount: views[0]?.observations.length ?? 0,
          completedCount,
          provider,
          model,
          completedAt,
        },
      }),
    ]);
    return { status: "success", revision, insightCount, completedCount, totalCount: interviews.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "画像刷新失败。";
    await Promise.all([
      prisma.candidateProfileState.updateMany({
        where: { id: PROFILE_STATE_ID, leaseToken: lease.token },
        data: {
          status: "failed",
          lastError: message,
          dueAt: new Date(Date.now() + 5 * 60_000),
          leaseToken: null,
          leaseExpiresAt: null,
        },
      }),
      prisma.candidateProfileRun.update({
        where: { id: run.id },
        data: { status: "failed", error: message, completedAt: new Date() },
      }),
    ]);
    throw error;
  }
}

export async function updateCandidateInsight(input: {
  id: string;
  action: "confirm" | "edit" | "hide" | "restore";
  title?: string;
  statement?: string;
}) {
  const insight = await prisma.candidateInsight.findUnique({ where: { id: input.id } });
  if (!insight) throw new Error("画像洞察不存在。");

  if (input.action === "hide") {
    return prisma.candidateInsight.update({
      where: { id: input.id },
      data: { status: "hidden", isUserLocked: true, userEditedAt: new Date() },
    });
  }
  if (input.action === "restore" || input.action === "confirm") {
    return prisma.candidateInsight.update({
      where: { id: input.id },
      data: { status: "active", isUserLocked: true, hasConflict: false, userEditedAt: new Date() },
    });
  }

  const title = input.title?.trim();
  const statement = input.statement?.trim();
  if (!title || !statement || title.length > 80 || statement.length > 500) {
    throw new Error("请输入有效的标题和洞察内容。");
  }
  return prisma.candidateInsight.update({
    where: { id: input.id },
    data: {
      title,
      statement,
      status: "active",
      isUserLocked: true,
      hasConflict: false,
      userEditedAt: new Date(),
    },
  });
}

export async function correctAbilityObservation(input: {
  id: string;
  action: "exclude" | "restore" | "reassign_dimension";
  dimension?: string;
}) {
  const observation = await prisma.abilityObservation.findUnique({ where: { id: input.id } });
  if (!observation) throw new Error("能力证据不存在。");
  if (input.action === "reassign_dimension") {
    const dimension = input.dimension ? normalizeProfileDimension(input.dimension) : null;
    if (!dimension) throw new Error("请选择有效的能力维度。");
    await prisma.abilityObservation.update({
      where: { id: input.id },
      data: {
        dimension,
        originalDimension: observation.originalDimension ?? observation.dimension,
        status: "active",
        userCorrectedAt: new Date(),
      },
    });
  } else {
    await prisma.abilityObservation.update({
      where: { id: input.id },
      data: {
        status: input.action === "exclude" ? "excluded" : "active",
        userCorrectedAt: new Date(),
      },
    });
  }
}

export async function mergeRoleContexts(input: { sourceKey: string; targetKey: string }) {
  if (!input.sourceKey || !input.targetKey || input.sourceKey === input.targetKey) {
    throw new Error("请选择两个不同的岗位视角。");
  }
  const [source, target] = await Promise.all([
    prisma.roleContext.findUnique({ where: { key: input.sourceKey } }),
    prisma.roleContext.findUnique({ where: { key: input.targetKey } }),
  ]);
  if (!source || !target) throw new Error("岗位视角不存在或已被合并。");

  await prisma.$transaction(async (tx) => {
    await tx.interview.updateMany({ where: { roleKey: source.key }, data: { roleKey: target.key } });
    await tx.abilityObservation.updateMany({ where: { roleKey: source.key }, data: { roleKey: target.key } });
    await tx.candidateInsight.deleteMany({ where: { roleKey: source.key, isUserLocked: false } });
    const locked = await tx.candidateInsight.findMany({
      where: { roleKey: source.key, isUserLocked: true },
    });
    for (const insight of locked) {
      const collides = await tx.candidateInsight.findUnique({
        where: {
          roleKey_normalizedKey: {
            roleKey: target.key,
            normalizedKey: insight.normalizedKey,
          },
        },
        select: { id: true },
      });
      await tx.candidateInsight.update({
        where: { id: insight.id },
        data: {
          roleKey: target.key,
          normalizedKey: collides
            ? `${insight.normalizedKey}:merged:${insight.id.slice(-8)}`
            : insight.normalizedKey,
        },
      });
    }
    await tx.candidateProfileMetric.deleteMany({ where: { roleKey: source.key } });
    await tx.candidateProfileSnapshot.deleteMany({ where: { roleKey: source.key } });
    await tx.roleContext.delete({ where: { key: source.key } });
  });
}
