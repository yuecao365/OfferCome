import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { deriveDeliveryObservation } from "@/lib/interviews/voice-metrics";

import { synthesizeCandidateInsights, type ProfileSynthesis } from "./agent";
import { assessInterviewQuestions } from "./assessment-agent";
import { aggregateProfileDimension, profileSourceWeight } from "./rules";
import { normalizeRoleTitle, roleContextKey } from "./role-context";
import { acquireProfileRefreshLease, ensureCandidateProfileState } from "./state";
import {
  PROFILE_AGGREGATION_VERSION,
  PROFILE_ASSESSMENT_VERSION,
  PROFILE_DIMENSIONS,
  PROFILE_PROMPT_VERSION,
  PROFILE_SOURCE_TYPES,
  PROFILE_STATE_ID,
  normalizeProfileDimension,
  type ProfileDimension,
  type ProfileSourceType,
} from "./types";

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

type CompletedInterview = Awaited<ReturnType<typeof getCompletedInterviews>>[number];

function isProfileSourceType(value: string): value is ProfileSourceType {
  return (PROFILE_SOURCE_TYPES as readonly string[]).includes(value);
}

function sourceTypeForInterview(interview: { kind: string; sourceType: string }): ProfileSourceType {
  if (interview.kind === "mock") return "mock_text";
  return isProfileSourceType(interview.sourceType)
    ? interview.sourceType
    : "real_summary";
}

function normalizedInsightKey(dimension: string, kind: string, title: string): string {
  const normalizedTitle = title
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  return `${dimension}:${kind}:${normalizedTitle || "insight"}`;
}

function interviewSourceHash(interview: CompletedInterview): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: interview.id,
        kind: interview.kind,
        sourceType: sourceTypeForInterview(interview),
        companyName: interview.companyName,
        jobTitle: interview.jobTitle,
        interviewedAt: interview.interviewedAt?.toISOString() ?? null,
        artifact: interview.importArtifact
          ? {
              candidateSpeaker: interview.importArtifact.candidateSpeaker,
              segmentsJson: interview.importArtifact.segmentsJson,
              voiceMetricsJson: interview.importArtifact.voiceMetricsJson,
            }
          : null,
        mockContext: interview.mockSession
          ? {
              jdTextSnapshot: interview.mockSession.jdTextSnapshot,
              contextSnapshotJson: interview.mockSession.contextSnapshotJson,
            }
          : null,
        questions: interview.questions.map((question) => ({
          id: question.id,
          question: question.question,
          answer: question.answer,
          category: question.category,
          evaluation: question.evaluation
            ? {
                score: question.evaluation.score,
                feedback: question.evaluation.feedback,
              }
            : null,
        })),
      }),
    )
    .digest("hex");
}

async function getCompletedInterviews() {
  return prisma.interview.findMany({
    where: {
      status: "completed",
      questions: { some: { answer: { not: null } } },
    },
    include: {
      importArtifact: true,
      mockSession: {
        select: { jdTextSnapshot: true, contextSnapshotJson: true },
      },
      questions: {
        include: { evaluation: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ interviewedAt: "asc" }, { createdAt: "asc" }],
  });
}

async function ensureInterviewRole(interview: CompletedInterview): Promise<string> {
  const normalizedTitle = normalizeRoleTitle(interview.jobTitle) || "未分类岗位";
  const key = roleContextKey(interview.jobTitle);
  await prisma.roleContext.upsert({
    where: { key },
    create: {
      key,
      displayName: interview.jobTitle.trim(),
      normalizedTitle,
      targetJobDescription: interview.mockSession?.jdTextSnapshot ?? null,
      blueprintJson: interview.mockSession?.contextSnapshotJson ?? "{}",
      isPinned: Boolean(interview.mockSession),
    },
    update: {},
  });
  if (interview.mockSession) {
    await prisma.roleContext.updateMany({
      where: { key, targetJobDescription: null },
      data: {
        targetJobDescription: interview.mockSession.jdTextSnapshot,
        blueprintJson: interview.mockSession.contextSnapshotJson,
        isPinned: true,
      },
    });
  }
  if (interview.roleKey !== key) {
    await prisma.interview.update({ where: { id: interview.id }, data: { roleKey: key } });
  }
  return key;
}

async function assessInterview(interview: CompletedInterview, sourceHash: string) {
  const existing = await prisma.interviewAssessment.findUnique({
    where: {
      interviewId_sourceHash_assessmentVersion: {
        interviewId: interview.id,
        sourceHash,
        assessmentVersion: PROFILE_ASSESSMENT_VERSION,
      },
    },
  });
  if (existing?.status === "completed") return existing;

  const roleKey = await ensureInterviewRole(interview);
  const sourceType = sourceTypeForInterview(interview);
  const assessment = await prisma.interviewAssessment.upsert({
    where: {
      interviewId_sourceHash_assessmentVersion: {
        interviewId: interview.id,
        sourceHash,
        assessmentVersion: PROFILE_ASSESSMENT_VERSION,
      },
    },
    create: {
      interviewId: interview.id,
      sourceHash,
      assessmentVersion: PROFILE_ASSESSMENT_VERSION,
      promptVersion: PROFILE_PROMPT_VERSION,
      status: "running",
    },
    update: { status: "running", error: null, startedAt: new Date() },
  });

  try {
    const questions = interview.questions.flatMap((question) => {
      const answer = question.answer?.trim();
      return answer
        ? [{
            id: question.id,
            question: question.question,
            answer: answer.slice(0, 8_000),
            category: question.category,
            existingEvaluation: question.evaluation
              ? { score: question.evaluation.score, feedback: question.evaluation.feedback }
              : null,
          }]
        : [];
    });
    const analyzed = await assessInterviewQuestions({
      companyName: interview.companyName,
      jobTitle: interview.jobTitle,
      sourceType,
      questions,
    });
    const priorCorrections = await prisma.abilityObservation.findMany({
      where: {
        interviewId: interview.id,
        userCorrectedAt: { not: null },
        assessmentId: { not: assessment.id },
      },
      orderBy: { userCorrectedAt: "desc" },
    });
    const correctionBySource = new Map<string, (typeof priorCorrections)[number]>();
    for (const correction of priorCorrections) {
      const sourceDimension = correction.originalDimension ?? correction.dimension;
      const key = `${correction.questionId ?? "voice"}:${sourceDimension}`;
      if (!correctionBySource.has(key)) correctionBySource.set(key, correction);
    }
    const correctedObservations = analyzed.observations.map((item) => {
      const correction = correctionBySource.get(`${item.questionId}:${item.dimension}`);
      return {
        ...item,
        dimension: normalizeProfileDimension(correction?.dimension ?? item.dimension) ?? item.dimension,
        status: correction?.status === "excluded" ? "excluded" : "active",
        originalDimension: correction?.originalDimension ?? null,
        userCorrectedAt: correction?.userCorrectedAt ?? null,
      };
    });
    const dimensionsByQuestion = new Map<string, ProfileDimension[]>();
    for (const item of correctedObservations) {
      dimensionsByQuestion.set(item.questionId, [
        ...(dimensionsByQuestion.get(item.questionId) ?? []),
        item.dimension,
      ]);
    }
    const delivery =
      sourceType === "real_audio" && interview.importArtifact?.voiceMetricsJson
        ? deriveDeliveryObservation(interview.importArtifact.voiceMetricsJson)
        : null;

    await prisma.$transaction(async (tx) => {
      await tx.abilityObservation.deleteMany({ where: { assessmentId: assessment.id } });
      if (correctedObservations.length > 0) {
        await tx.abilityObservation.createMany({
          data: correctedObservations.map((item) => ({
            assessmentId: assessment.id,
            interviewId: interview.id,
            questionId: item.questionId,
            dimension: item.dimension,
            score: item.score,
            modelConfidence: item.confidence,
            evidenceExcerpt: item.evidenceExcerpt,
            sourceType,
            sourceWeight: profileSourceWeight(sourceType),
            roleKey,
            status: item.status,
            originalDimension: item.originalDimension,
            userCorrectedAt: item.userCorrectedAt,
          })),
        });
      }
      if (delivery) {
        await tx.abilityObservation.create({
          data: {
            assessmentId: assessment.id,
            interviewId: interview.id,
            dimension: "delivery_fluency",
            score: delivery.score,
            modelConfidence: delivery.confidence,
            evidenceExcerpt: delivery.summary,
            sourceType,
            sourceWeight: 1,
            roleKey,
            speechMetricsJson: interview.importArtifact!.voiceMetricsJson,
          },
        });
      }
      for (const question of questions) {
        await tx.interviewQuestionEvaluation.upsert({
          where: { interviewQuestionId: question.id },
          create: {
            interviewQuestionId: question.id,
            assessmentId: assessment.id,
            applicableDimensionsJson: JSON.stringify(dimensionsByQuestion.get(question.id) ?? []),
          },
          update: {
            assessmentId: assessment.id,
            applicableDimensionsJson: JSON.stringify(dimensionsByQuestion.get(question.id) ?? []),
          },
        });
      }
      await tx.interviewAssessment.update({
        where: { id: assessment.id },
        data: {
          status: "completed",
          provider: analyzed.provider,
          model: analyzed.model,
          completedAt: new Date(),
          error: null,
        },
      });
    });
    return assessment;
  } catch (error) {
    await prisma.interviewAssessment.update({
      where: { id: assessment.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "面试评估失败。",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

async function buildProfileViews() {
  const assessments = await prisma.interviewAssessment.findMany({
    where: {
      status: "completed",
      assessmentVersion: PROFILE_ASSESSMENT_VERSION,
      interview: { status: "completed" },
    },
    include: {
      interview: { select: { interviewedAt: true, updatedAt: true, roleKey: true } },
      observations: { where: { status: "active" } },
    },
    orderBy: { completedAt: "desc" },
  });
  const latestByInterview = new Map<string, (typeof assessments)[number]>();
  for (const assessment of assessments) {
    if (!latestByInterview.has(assessment.interviewId)) {
      latestByInterview.set(assessment.interviewId, assessment);
    }
  }
  const latest = [...latestByInterview.values()];
  const roleKeys = [...new Set(latest.flatMap((item) => item.interview.roleKey ? [item.interview.roleKey] : []))];
  return ["all", ...roleKeys].map((roleKey) => {
    const scoped = roleKey === "all"
      ? latest
      : latest.filter((item) => item.interview.roleKey === roleKey);
    const observations = scoped.flatMap((assessment) =>
      assessment.observations.flatMap((observation) => {
        const dimension = normalizeProfileDimension(observation.dimension);
        const sourceType = isProfileSourceType(observation.sourceType)
          ? observation.sourceType
          : null;
        if (!dimension || !sourceType) return [];
        return [{
          id: observation.id,
          interviewId: observation.interviewId,
          questionId: observation.questionId,
          dimension,
          score: observation.score,
          modelConfidence: observation.modelConfidence,
          evidenceExcerpt: observation.evidenceExcerpt,
          sourceType,
          sourceWeight: observation.sourceWeight,
          status: observation.status === "excluded" ? "excluded" as const : "active" as const,
          interviewDate: assessment.interview.interviewedAt ?? assessment.interview.updatedAt,
        }];
      }),
    );
    const metrics = PROFILE_DIMENSIONS.map((dimension) =>
      aggregateProfileDimension(dimension, observations),
    );
    return { roleKey, observations, metrics };
  });
}

function validateSynthesis(
  synthesis: ProfileSynthesis,
  observations: Awaited<ReturnType<typeof buildProfileViews>>[number]["observations"],
) {
  const byId = new Map(observations.map((item) => [item.id, item]));
  return synthesis.insights.flatMap((insight) => {
    const evidence = insight.evidence.flatMap((reference) => {
      const observation = byId.get(reference.observationId);
      return observation?.dimension === insight.dimension
        ? [{ observation, polarity: reference.polarity }]
        : [];
    });
    return evidence.length > 0 ? [{ ...insight, evidence }] : [];
  });
}

async function persistProfileViews(
  views: Awaited<ReturnType<typeof buildProfileViews>>,
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
        if (!metric || metric.interviewCount < 2) continue;
        const normalizedKey = normalizedInsightKey(insight.dimension, insight.kind, insight.title);
        if (seenKeys.has(normalizedKey)) continue;
        seenKeys.add(normalizedKey);
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
            status: "active",
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
      const eligibleMetrics = view.metrics.filter((metric) => metric.interviewCount >= 2);
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
