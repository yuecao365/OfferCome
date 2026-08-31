import type {
  ProfileGraphInsight,
} from "@/components/candidate-profile/profile-graph-model";
import { detectInsightConflict } from "@/lib/candidate-profile/conflict";
import {
  aggregateProfileDimension,
  deriveInsightStatus,
  type AggregatedProfileMetric,
  type AggregationObservation,
} from "@/lib/candidate-profile/rules";
import {
  PROFILE_DIMENSIONS,
  PROFILE_INSIGHT_KINDS,
  normalizeProfileDimension,
  normalizeProfileSourceType,
  type ProfileInsightKind,
} from "@/lib/candidate-profile/types";

import type {
  TrialProfile,
  TrialProfileInsight,
  TrialProfileObservation,
  TrialWorkspace,
  TrialWorkspaceInterview,
} from "./workspace";

/**
 * 体验版能力画像的纯函数层。
 *
 * 流水线与本地版同构：评估（agent，走无状态 API）→ 聚合（rules.ts，
 * 直接复用）→ 总结（agent，走无状态 API）→ 存储（浏览器工作台）。
 * 等级、趋势、置信度、洞察状态的推导全部**引用**本地版实现，不复制。
 *
 * 体验版只有单一"all"视角：没有岗位视角切分与合并（那依赖服务端的
 * 角色上下文实体），数据量级也用不上。
 */

const emptyProfile = (): TrialProfile => ({
  revision: 0,
  refreshedAt: null,
  assessed: {},
  observations: [],
  insights: [],
  snapshots: [],
});

export function trialProfile(workspace: TrialWorkspace): TrialProfile {
  return workspace.profile ?? emptyProfile();
}

/** 面试内容指纹：变了才重新评估，不浪费访客的 Key。 */
export function trialInterviewFingerprint(
  interview: TrialWorkspaceInterview,
): string {
  return `${interview.updatedAt}:${interview.questions.length}`;
}

/** 可参与画像的面试：已完成且至少有一条有效回答。 */
export function assessableTrialInterviews(
  workspace: TrialWorkspace,
): TrialWorkspaceInterview[] {
  return workspace.interviews.filter(
    (interview) =>
      interview.status === "completed" &&
      interview.questions.some(
        (question) => question.question.trim() && question.answer.trim(),
      ),
  );
}

export function pendingAssessmentInterviews(
  workspace: TrialWorkspace,
): TrialWorkspaceInterview[] {
  const assessed = trialProfile(workspace).assessed;
  return assessableTrialInterviews(workspace).filter(
    (interview) => assessed[interview.id] !== trialInterviewFingerprint(interview),
  );
}

function interviewDate(interview: TrialWorkspaceInterview): Date {
  return new Date(interview.interviewedAt ?? interview.updatedAt);
}

function aggregationObservations(
  workspace: TrialWorkspace,
): AggregationObservation[] {
  const interviews = new Map(
    workspace.interviews.map((interview) => [interview.id, interview]),
  );
  return trialProfile(workspace).observations.flatMap((observation) => {
    const interview = interviews.get(observation.interviewId);
    const dimension = normalizeProfileDimension(observation.dimension);
    if (!interview || !dimension) return [];
    return [
      {
        interviewId: observation.interviewId,
        interviewDate: interviewDate(interview),
        dimension,
        score: observation.score,
        modelConfidence: observation.modelConfidence,
        sourceType: normalizeProfileSourceType(
          observation.sourceType,
          interview.kind,
        ),
        status: observation.status,
      },
    ];
  });
}

export function trialProfileMetrics(
  workspace: TrialWorkspace,
  now = new Date(),
): AggregatedProfileMetric[] {
  const observations = aggregationObservations(workspace);
  return PROFILE_DIMENSIONS.map((dimension) =>
    aggregateProfileDimension(dimension, observations, now),
  );
}

function isInsightKind(value: string): value is ProfileInsightKind {
  return (PROFILE_INSIGHT_KINDS as readonly string[]).includes(value);
}

/** 组装 CandidateProfileDashboard 吃的洞察形状（含证据联查）。 */
export function trialProfileInsightViews(
  workspace: TrialWorkspace,
  metrics: AggregatedProfileMetric[],
): ProfileGraphInsight[] {
  const profile = trialProfile(workspace);
  const interviews = new Map(
    workspace.interviews.map((interview) => [interview.id, interview]),
  );
  const observations = new Map(
    profile.observations.map((observation) => [observation.id, observation]),
  );

  return profile.insights.flatMap((insight) => {
    const dimension = normalizeProfileDimension(insight.dimension);
    if (!dimension || !isInsightKind(insight.kind)) return [];
    const metric = metrics.find((item) => item.dimension === dimension);

    const evidence = insight.evidence.flatMap((reference) => {
      const observation = observations.get(reference.observationId);
      const interview = observation
        ? interviews.get(observation.interviewId)
        : undefined;
      if (!observation || !interview) return [];
      const question = interview.questions.find(
        (item) => item.id === observation.questionId,
      );
      return [
        {
          id: `${insight.id}:${observation.id}`,
          interviewId: observation.interviewId,
          questionId: observation.questionId,
          observationId: observation.id,
          observationStatus: observation.status,
          polarity: reference.polarity,
          excerpt: observation.evidenceExcerpt,
          sourceKind: normalizeProfileSourceType(
            observation.sourceType,
            interview.kind,
          ),
          companyName: interview.companyName,
          jobTitle: interview.jobTitle,
          question: question?.question ?? "原问题已删除",
          answer: question?.answer ?? "",
          interviewAt: interview.interviewedAt,
        },
      ];
    });
    if (evidence.length === 0) return [];

    return [
      {
        id: insight.id,
        roleKey: "all",
        dimension,
        kind: insight.kind,
        title: insight.title,
        statement: insight.statement,
        confidence: metric?.evidenceConfidence ?? 0,
        level: metric?.level ?? null,
        levelLabel: metric?.levelLabel ?? "待积累",
        trend: metric?.trend ?? "insufficient",
        confidenceLabel: metric?.confidenceLabel ?? "较低",
        status: insight.status,
        isUserLocked: insight.isUserLocked,
        hasConflict: detectInsightConflict({
          evidence,
          interviewScores: (metric?.points ?? []).map((point) => ({
            interviewId: point.interviewId,
            score: point.score,
          })),
        }),
        evidence,
      },
    ];
  });
}

/* ------------------------------ 写操作 ------------------------------ */

export function applyTrialAssessment(
  workspace: TrialWorkspace,
  interviewId: string,
  observations: Omit<TrialProfileObservation, "status">[],
): TrialWorkspace {
  const interview = workspace.interviews.find((item) => item.id === interviewId);
  if (!interview) return workspace;
  const profile = trialProfile(workspace);
  return {
    ...workspace,
    profile: {
      ...profile,
      assessed: {
        ...profile.assessed,
        [interviewId]: trialInterviewFingerprint(interview),
      },
      observations: [
        ...profile.observations.filter(
          (observation) => observation.interviewId !== interviewId,
        ),
        ...observations.map((observation) => ({
          ...observation,
          status: "active" as const,
        })),
      ],
    },
  };
}

export function applyTrialSynthesis(
  workspace: TrialWorkspace,
  insights: Omit<TrialProfileInsight, "id" | "status" | "isUserLocked">[],
  metrics: AggregatedProfileMetric[],
): TrialWorkspace {
  const profile = trialProfile(workspace);
  const observations = new Map(
    profile.observations.map((observation) => [observation.id, observation]),
  );
  // 用户锁定的洞察永远不被新一轮总结覆盖，与本地版同一条规则。
  const locked = profile.insights.filter((insight) => insight.isUserLocked);
  const fresh = insights.map((insight) => {
    const metric = metrics.find(
      (item) => item.dimension === normalizeProfileDimension(insight.dimension),
    );
    const supportingInterviewIds = insight.evidence.flatMap((reference) => {
      const observation = observations.get(reference.observationId);
      return observation ? [observation.interviewId] : [];
    });
    return {
      ...insight,
      id: crypto.randomUUID(),
      isUserLocked: false,
      status: deriveInsightStatus({
        isUserLocked: false,
        confidence: metric?.evidenceConfidence ?? 0,
        supportingInterviewIds,
      }),
    };
  });

  const revision = profile.revision + 1;
  return {
    ...workspace,
    profile: {
      ...profile,
      revision,
      refreshedAt: new Date().toISOString(),
      insights: [...locked, ...fresh],
      snapshots: [
        ...profile.snapshots,
        {
          revision,
          createdAt: new Date().toISOString(),
          metrics: metrics.map((metric) => ({
            dimension: metric.dimension,
            level: metric.level,
            levelLabel: metric.levelLabel,
          })),
        },
      ].slice(-12),
    },
  };
}

/** 与本地版 updateCandidateInsight 相同的状态语义。 */
export function updateTrialInsight(
  workspace: TrialWorkspace,
  input: {
    id: string;
    action: "confirm" | "edit" | "hide" | "restore";
    title?: string;
    statement?: string;
  },
): TrialWorkspace {
  const profile = trialProfile(workspace);
  return {
    ...workspace,
    profile: {
      ...profile,
      insights: profile.insights.map((insight) => {
        if (insight.id !== input.id) return insight;
        if (input.action === "hide") {
          return { ...insight, status: "hidden" as const, isUserLocked: true };
        }
        if (input.action === "edit") {
          return {
            ...insight,
            title: input.title?.trim() || insight.title,
            statement: input.statement?.trim() || insight.statement,
            status: "active" as const,
            isUserLocked: true,
          };
        }
        return { ...insight, status: "active" as const, isUserLocked: true };
      }),
    },
  };
}

/** 与本地版 correctAbilityObservation 相同的语义。 */
export function correctTrialObservation(
  workspace: TrialWorkspace,
  input: {
    id: string;
    action: "exclude" | "restore" | "reassign_dimension";
    dimension?: string;
  },
): TrialWorkspace {
  const profile = trialProfile(workspace);
  return {
    ...workspace,
    profile: {
      ...profile,
      observations: profile.observations.map((observation) => {
        if (observation.id !== input.id) return observation;
        if (input.action === "reassign_dimension") {
          const dimension = input.dimension
            ? normalizeProfileDimension(input.dimension)
            : null;
          return dimension
            ? { ...observation, dimension, status: "active" as const }
            : observation;
        }
        return {
          ...observation,
          status: input.action === "exclude" ? ("excluded" as const) : ("active" as const),
        };
      }),
    },
  };
}
