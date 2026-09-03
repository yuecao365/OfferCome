import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { deriveDeliveryObservation } from "@/lib/interviews/voice-metrics";

import { assessInterviewQuestions } from "./assessment-agent";
import { isAssessableAnswer, profileSourceWeight } from "./rules";
import { normalizeRoleTitle, roleContextKey } from "./role-context";
import {
  PROFILE_ASSESSMENT_VERSION,
  PROFILE_PROMPT_VERSION,
  PROFILE_SOURCE_TYPES,
  normalizeProfileDimension,
  type ProfileDimension,
  type ProfileSourceType,
} from "./types";

/**
 * 画像流水线第一相：把一场已完成的面试变成可聚合的能力观察。
 *
 * 幂等的关键是 sourceHash——面试内容没变就直接复用已完成的评估，
 * 不再花一次模型调用。
 */

export type CompletedInterview = Awaited<
  ReturnType<typeof getCompletedInterviews>
>[number];

export function isProfileSourceType(value: string): value is ProfileSourceType {
  return (PROFILE_SOURCE_TYPES as readonly string[]).includes(value);
}

function sourceTypeForInterview(interview: { kind: string; sourceType: string }): ProfileSourceType {
  if (interview.kind === "mock") return "mock_text";
  return isProfileSourceType(interview.sourceType)
    ? interview.sourceType
    : "real_summary";
}


export function interviewSourceHash(interview: CompletedInterview): string {
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
          voiceMetricsJson: question.voiceMetricsJson,
          // 评估过程本身会给真实面试补一条空的评分记录（只为记录适用维度）。
          // 空记录和"没有记录"必须算同一个哈希，否则每场真实面试都会被
          // 重新评估一次，白花一次模型调用。
          evaluation:
            question.evaluation &&
            (question.evaluation.score !== null ||
              question.evaluation.feedback !== null)
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

export async function getCompletedInterviews() {
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

export async function assessInterview(interview: CompletedInterview, sourceHash: string) {
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
      return answer && isAssessableAnswer(answer)
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
    const mockDeliveryObservations =
      interview.kind === "mock"
        ? interview.questions.flatMap((question) => {
            if (!question.voiceMetricsJson) return [];
            const delivery = deriveDeliveryObservation(question.voiceMetricsJson);
            if (!delivery) return [];
            const correction = correctionBySource.get(
              `${question.id}:delivery_fluency`,
            );
            return [
              {
                assessmentId: assessment.id,
                interviewId: interview.id,
                questionId: question.id,
                dimension: normalizeProfileDimension(
                  correction?.dimension ?? "delivery_fluency",
                )!,
                score: delivery.score,
                modelConfidence: delivery.confidence,
                evidenceExcerpt: delivery.summary,
                sourceType: "mock_text" as const,
                sourceWeight: profileSourceWeight("mock_text"),
                roleKey,
                speechMetricsJson: question.voiceMetricsJson,
                status: correction?.status === "excluded" ? "excluded" : "active",
                originalDimension: correction?.originalDimension ?? null,
                userCorrectedAt: correction?.userCorrectedAt ?? null,
              },
            ];
          })
        : [];
    const dimensionsByQuestion = new Map<string, ProfileDimension[]>();
    for (const item of correctedObservations) {
      dimensionsByQuestion.set(item.questionId, [
        ...(dimensionsByQuestion.get(item.questionId) ?? []),
        item.dimension,
      ]);
    }
    for (const item of mockDeliveryObservations) {
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
      if (mockDeliveryObservations.length > 0) {
        await tx.abilityObservation.createMany({
          data: mockDeliveryObservations,
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
