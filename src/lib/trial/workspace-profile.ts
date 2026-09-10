import type {
  ProfileGraphInsight,
} from "@/components/candidate-profile/profile-graph-model";
import { detectInsightConflict } from "@/lib/candidate-profile/conflict";
import { normalizeRoleTitle } from "@/lib/candidate-profile/role-title";
import {
  aggregateProfileDimension,
  deriveInsightStatus,
  type AggregatedProfileMetric,
  type AggregationObservation,
} from "@/lib/candidate-profile/rules";
import {
  PROFILE_DIMENSIONS,
  PROFILE_INSIGHT_KINDS,
  parseProfileDimension,
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
 * 流水线与本地版同构：观察（模拟面试由评分推导、真实面试走无状态评估接口）→ 聚合（rules.ts，
 * 直接复用）→ 总结（agent，走无状态 API）→ 存储（浏览器工作台）。
 * 等级、趋势、置信度、洞察状态的推导全部**引用**本地版实现，不复制。
 *
 * 岗位视角与本地版一致："all" 之外按岗位名归一切出视角，可以把一个视角并入另一个。
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

/* ------------------------------ 岗位视角 ------------------------------ */

/** 一场面试属于哪个岗位视角：合并过的按覆盖值，否则按岗位名归一（浏览器里不用哈希）。 */
export function trialRoleKey(interview: Pick<TrialWorkspaceInterview, "jobTitle" | "roleKey">): string {
  return interview.roleKey ?? `role:${normalizeRoleTitle(interview.jobTitle) || "未分类岗位"}`;
}

export type TrialRole = { key: string; displayName: string };

/** 有面试记录的岗位视角，显示名取该视角下最早一场的岗位名。 */
export function trialRoles(workspace: TrialWorkspace): TrialRole[] {
  const roles = new Map<string, string>();
  for (const interview of [...workspace.interviews].toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    const key = trialRoleKey(interview);
    if (!roles.has(key)) roles.set(key, interview.jobTitle.trim());
  }
  return [...roles.entries()].map(([key, displayName]) => ({ key, displayName }));
}

function interviewDate(interview: TrialWorkspaceInterview): Date {
  return new Date(interview.interviewedAt ?? interview.updatedAt);
}

function aggregationObservations(
  workspace: TrialWorkspace,
  roleKey: string,
): AggregationObservation[] {
  const interviews = new Map(
    workspace.interviews.map((interview) => [interview.id, interview]),
  );
  return trialProfile(workspace).observations.flatMap((observation) => {
    const interview = interviews.get(observation.interviewId);
    const dimension = parseProfileDimension(observation.dimension);
    if (!interview || !dimension) return [];
    if (roleKey !== "all" && trialRoleKey(interview) !== roleKey) return [];
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

/** 一个视角的分维度指标；缺省是全部面试的 "all" 视角。 */
export function trialProfileMetrics(
  workspace: TrialWorkspace,
  roleKey = "all",
  now = new Date(),
): AggregatedProfileMetric[] {
  const observations = aggregationObservations(workspace, roleKey);
  return PROFILE_DIMENSIONS.map((dimension) =>
    aggregateProfileDimension(dimension, observations, now),
  );
}

export function insightRoleKey(insight: Pick<TrialProfileInsight, "roleKey">): string {
  return insight.roleKey ?? "all";
}

function isInsightKind(value: string): value is ProfileInsightKind {
  return (PROFILE_INSIGHT_KINDS as readonly string[]).includes(value);
}

/** 组装 CandidateProfileDashboard 吃的洞察形状（含证据联查）；每条洞察按自己的视角取指标。 */
export function trialProfileInsightViews(
  workspace: TrialWorkspace,
  metricsByRole: Map<string, AggregatedProfileMetric[]>,
): ProfileGraphInsight[] {
  const profile = trialProfile(workspace);
  const interviews = new Map(
    workspace.interviews.map((interview) => [interview.id, interview]),
  );
  const observations = new Map(
    profile.observations.map((observation) => [observation.id, observation]),
  );

  return profile.insights.flatMap((insight) => {
    const dimension = parseProfileDimension(insight.dimension);
    if (!dimension || !isInsightKind(insight.kind)) return [];
    const roleKey = insightRoleKey(insight);
    const metric = metricsByRole.get(roleKey)?.find((item) => item.dimension === dimension);

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
        roleKey,
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

export type TrialSynthesizedView = {
  roleKey: string;
  metrics: AggregatedProfileMetric[];
  insights: Omit<TrialProfileInsight, "id" | "status" | "isUserLocked" | "roleKey">[];
};

/** 一轮总结的结果落盘：每个视角的非锁定洞察整体替换，快照按视角各记一份。 */
export function applyTrialSynthesis(
  workspace: TrialWorkspace,
  views: TrialSynthesizedView[],
): TrialWorkspace {
  const profile = trialProfile(workspace);
  const observations = new Map(
    profile.observations.map((observation) => [observation.id, observation]),
  );
  const refreshed = new Set(views.map((view) => view.roleKey));
  // 用户锁定的洞察永远不被新一轮总结覆盖，与本地版同一条规则。
  const kept = profile.insights.filter((insight) => insight.isUserLocked || !refreshed.has(insightRoleKey(insight)));
  const fresh = views.flatMap((view) =>
    view.insights.map((insight) => {
      const metric = view.metrics.find(
        (item) => item.dimension === parseProfileDimension(insight.dimension),
      );
      const supportingInterviewIds = insight.evidence.flatMap((reference) => {
        const observation = observations.get(reference.observationId);
        return observation ? [observation.interviewId] : [];
      });
      return {
        ...insight,
        id: crypto.randomUUID(),
        roleKey: view.roleKey,
        isUserLocked: false,
        status: deriveInsightStatus({
          isUserLocked: false,
          confidence: metric?.evidenceConfidence ?? 0,
          supportingInterviewIds,
        }),
      };
    }),
  );

  const revision = profile.revision + 1;
  const createdAt = new Date().toISOString();
  return {
    ...workspace,
    profile: {
      ...profile,
      revision,
      refreshedAt: createdAt,
      insights: [...kept, ...fresh],
      snapshots: [
        ...profile.snapshots,
        ...views.map((view) => ({
          revision,
          roleKey: view.roleKey,
          createdAt,
          metrics: view.metrics.map((metric) => ({
            dimension: metric.dimension,
            level: metric.level,
            levelLabel: metric.levelLabel,
          })),
        })),
      ].slice(-60),
    },
  };
}

/** 与本地版 mergeRoleContexts 同语义：源视角的面试改挂到目标视角，源视角的洞察与快照清掉（锁定的搬过去）。 */
export function mergeTrialRoles(workspace: TrialWorkspace, sourceKey: string, targetKey: string): TrialWorkspace {
  if (!sourceKey || !targetKey || sourceKey === targetKey || sourceKey === "all" || targetKey === "all") {
    throw new Error("请选择两个不同的岗位视角。");
  }
  const profile = trialProfile(workspace);
  return {
    ...workspace,
    interviews: workspace.interviews.map((interview) =>
      trialRoleKey(interview) === sourceKey ? { ...interview, roleKey: targetKey } : interview,
    ),
    profile: {
      ...profile,
      insights: profile.insights.flatMap((insight) => {
        if (insightRoleKey(insight) !== sourceKey) return [insight];
        return insight.isUserLocked ? [{ ...insight, roleKey: targetKey }] : [];
      }),
      snapshots: profile.snapshots.filter((snapshot) => (snapshot.roleKey ?? "all") !== sourceKey),
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
            ? parseProfileDimension(input.dimension)
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
