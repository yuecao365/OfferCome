import "server-only";

import { prisma } from "@/lib/db";

import { isProfileSourceType } from "./assessment";
import { aggregateProfileDimension } from "./rules";
import {
  PROFILE_ASSESSMENT_VERSION,
  PROFILE_DIMENSIONS,
  normalizeProfileDimension,
} from "./types";
import type { ProfileSynthesis } from "./agent";

/**
 * 画像流水线第二相：把观察聚合成分维度指标，并校验模型给出的洞察。
 *
 * 每场面试只取最新一次评估；"all" 视角之外再按岗位切分，
 * 让用户能分别看到"整体表现"和"针对某个岗位的表现"。
 */

export type ProfileView = Awaited<ReturnType<typeof buildProfileViews>>[number];

export async function buildProfileViews() {
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

export function validateSynthesis(
  synthesis: ProfileSynthesis,
  observations: ProfileView["observations"],
) {
  const byId = new Map(observations.map((item) => [item.id, item]));
  return synthesis.insights.flatMap((insight) => {
    // 引用真实性是硬门：observationId 必须真实存在。
    // 维度一致性放宽：跨维度引用是合法的——"稳定模式"类洞察天然横跨多个维度。
    const evidence = insight.evidence.flatMap((reference) => {
      const observation = byId.get(reference.observationId);
      return observation
        ? [{ observation, polarity: reference.polarity }]
        : [];
    });
    return evidence.length > 0 ? [{ ...insight, evidence }] : [];
  });
}
