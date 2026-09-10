import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { REAL_USAGE_INTERVIEW_WHERE } from "@/lib/interviews/types";
import { deriveDeliveryObservation } from "@/lib/interviews/voice-metrics";
import { parseJsonArray } from "@/lib/json";

import { assessInterviewQuestions } from "./assessment-agent";
import { deriveObservationsFromEvaluation, type ScoredDimension } from "./derive";
import { isAssessableAnswer, profileSourceWeight } from "./rules";
import { normalizeRoleTitle, roleContextKey } from "./role-context";
import {
  PROFILE_ASSESSMENT_VERSION,
  PROFILE_PROMPT_VERSION,
  PROFILE_SOURCE_TYPES,
  parseProfileDimension,
  type ProfileDimension,
  type ProfileSourceType,
} from "./types";

/**
 * 画像流水线第一相：把一场已完成的面试变成可聚合的能力观察。
 *
 * 模拟面试的观察由逐段评分推导（纯代码），真实面试由评估器逐题判断（一次模型调用）；
 * 之后走同一条路：套用用户纠正、补语音观察、一个事务落库。
 * 幂等的关键是 sourceHash——面试内容与评分没变就直接复用已完成的评估。
 */

export type CompletedInterview = Awaited<
  ReturnType<typeof getCompletedInterviews>
>[number];

type ObservationDraft = {
  dimension: ProfileDimension;
  score: number;
  confidence: number;
  evidenceExcerpt: string;
};

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
          // 模拟面试的观察来自评分，评分重跑过就要重新推导。
          evaluatedAt: question.evaluation?.evaluatedAt?.toISOString() ?? null,
        })),
      }),
    )
    .digest("hex");
}

export async function getCompletedInterviews() {
  return prisma.interview.findMany({
    where: {
      ...REAL_USAGE_INTERVIEW_WHERE,
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

type TextObservations = {
  observations: (ObservationDraft & { questionId: string })[];
  provider: string | null;
  model: string | null;
};

/** 模拟面试：每段的评分表维度分直接映射成观察，零模型调用。 */
function deriveMockObservations(interview: CompletedInterview): TextObservations {
  const observations = interview.questions.flatMap((question) => {
    const answer = question.answer?.trim();
    if (!answer || question.evaluation?.evaluationStatus !== "completed") return [];
    return deriveObservationsFromEvaluation({
      questionId: question.id,
      answer,
      dimensions: parseJsonArray(question.evaluation.dimensionsJson) as ScoredDimension[],
    });
  });
  return { observations, provider: null, model: null };
}

/** 真实面试：没有评分表，让评估器读回答；太短的回答没有信息量，不送。 */
async function assessRealObservations(
  interview: CompletedInterview,
  sourceType: ProfileSourceType,
): Promise<TextObservations> {
  const questions = interview.questions.flatMap((question) => {
    const answer = question.answer?.trim();
    return answer && isAssessableAnswer(answer)
      ? [{ id: question.id, question: question.question, answer: answer.slice(0, 8_000), category: question.category }]
      : [];
  });
  return assessInterviewQuestions({
    companyName: interview.companyName,
    jobTitle: interview.jobTitle,
    sourceType,
    questions,
  });
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
    const analyzed =
      interview.kind === "mock"
        ? deriveMockObservations(interview)
        : await assessRealObservations(interview, sourceType);

    // 用户改过维度或排除过的观察，重新评估后照旧生效：按（题，原维度）对上。
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
    const toRow = (questionId: string | null, draft: ObservationDraft, speechMetricsJson: string | null = null) => {
      const correction = correctionBySource.get(`${questionId ?? "voice"}:${draft.dimension}`);
      return {
        assessmentId: assessment.id,
        interviewId: interview.id,
        questionId,
        dimension: parseProfileDimension(correction?.dimension ?? draft.dimension) ?? draft.dimension,
        score: draft.score,
        modelConfidence: draft.confidence,
        evidenceExcerpt: draft.evidenceExcerpt,
        sourceType,
        sourceWeight: profileSourceWeight(sourceType),
        roleKey,
        speechMetricsJson,
        status: correction?.status === "excluded" ? "excluded" : "active",
        originalDimension: correction?.originalDimension ?? null,
        userCorrectedAt: correction?.userCorrectedAt ?? null,
      };
    };
    const deliveryRow = (questionId: string | null, voiceMetricsJson: string | null) => {
      const delivery = voiceMetricsJson ? deriveDeliveryObservation(voiceMetricsJson) : null;
      return delivery
        ? [toRow(questionId, { dimension: "delivery_fluency", score: delivery.score, confidence: delivery.confidence, evidenceExcerpt: delivery.summary }, voiceMetricsJson)]
        : [];
    };

    const rows = [
      ...analyzed.observations.map((item) => toRow(item.questionId, item)),
      // 语音观察：模拟面试按题（语音面试的落点），真实录音按整场。
      ...interview.questions.flatMap((question) => deliveryRow(question.id, question.voiceMetricsJson)),
      ...(sourceType === "real_audio" ? deliveryRow(null, interview.importArtifact?.voiceMetricsJson ?? null) : []),
    ];

    await prisma.$transaction(async (tx) => {
      await tx.abilityObservation.deleteMany({ where: { assessmentId: assessment.id } });
      if (rows.length > 0) await tx.abilityObservation.createMany({ data: rows });
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
