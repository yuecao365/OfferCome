"use client";

import type { CandidateProfileTransport } from "@/components/candidate-profile/candidate-profile-dashboard";
import { deriveObservationsFromEvaluation } from "@/lib/candidate-profile/derive";

import { assessInterview, isMissingAiConfig, synthesizeInsights } from "./client";
import {
  applyTrialAssessment,
  applyTrialSynthesis,
  assessableTrialInterviews,
  correctTrialObservation,
  mergeTrialRoles,
  pendingAssessmentInterviews,
  trialProfile,
  trialProfileMetrics,
  trialRoleKey,
  trialRoles,
  updateTrialInsight,
  type TrialSynthesizedView,
} from "./workspace-profile";
import { currentWorkspace, mutateWorkspace } from "./workspace-store";

/**
 * 网页版能力画像的浏览器编排：本地版由服务端后台任务驱动流水线，
 * 网页版没有服务端状态，改为在浏览器里顺序执行（由 AppShell 上的
 * TrialProfileRefreshScheduler 触发），进度通过与本地版 status API
 * 相同形状的数据喂给表盘。
 */

type TrialRunState = {
  status: "idle" | "running" | "failed";
  phase: "idle" | "assessment" | "synthesis";
  completedCount: number;
  totalCount: number;
  lastError: string | null;
};

/** 与本地版 ASSESSMENT_BATCH_SIZE 同口径：一轮最多评估几场面试。 */
const ASSESSMENT_BATCH_SIZE = 3;

const runState: TrialRunState = {
  status: "idle",
  phase: "idle",
  completedCount: 0,
  totalCount: 0,
  lastError: null,
};

function friendlyMessage(caught: unknown, fallback: string): string {
  if (isMissingAiConfig(caught)) {
    return "还没有连接模型服务，请到设置页连接后重试。";
  }
  return caught instanceof Error ? caught.message : fallback;
}

/** 评估待处理面试 → 本地聚合 → 生成洞察，全部结果写入浏览器工作台。 */
export async function refreshTrialProfile(): Promise<void> {
  if (runState.status === "running") return;

  const workspace = currentWorkspace();
  const assessable = assessableTrialInterviews(workspace);
  const pending = pendingAssessmentInterviews(workspace);

  runState.status = "running";
  runState.phase = "assessment";
  runState.totalCount = assessable.length;
  runState.completedCount = assessable.length - pending.length;
  runState.lastError = null;

  try {
    for (const interview of pending.slice(0, ASSESSMENT_BATCH_SIZE)) {
      // 与本地版同一口径：模拟面试的观察由逐段评分推导（零模型调用），真实面试才调评估器。
      const observations =
        interview.kind === "mock"
          ? interview.questions.flatMap((question) =>
              question.evaluation && question.answer.trim()
                ? deriveObservationsFromEvaluation({ questionId: question.id, answer: question.answer, dimensions: question.evaluation.dimensions })
                : [],
            )
          : await assessInterview({
              companyName: interview.companyName,
              jobTitle: interview.jobTitle,
              sourceType: "real_summary",
              questions: interview.questions
                .filter((question) => question.question.trim() && question.answer.trim())
                .map((question) => ({
                  id: question.id,
                  question: question.question,
                  answer: question.answer,
                  category: question.category,
                })),
            });
      mutateWorkspace((current) =>
        applyTrialAssessment(
          current,
          interview.id,
          observations.map((observation) => ({
            id: crypto.randomUUID(),
            interviewId: interview.id,
            questionId: observation.questionId,
            dimension: observation.dimension,
            score: observation.score,
            modelConfidence: observation.confidence,
            evidenceExcerpt: observation.evidenceExcerpt,
            sourceType: interview.kind === "mock" ? "mock_text" : "real_summary",
          })),
        ),
      );
      runState.completedCount += 1;
    }

    if (pending.length > ASSESSMENT_BATCH_SIZE) {
      // 还有没评估完的面试，先把这一批的观察落盘，合成留到下一轮，
      // 避免用不完整的证据生成洞察。
      runState.status = "idle";
      runState.phase = "idle";
      return;
    }

    runState.phase = "synthesis";
    await synthesizeAllViews();

    runState.status = "idle";
    runState.phase = "idle";
  } catch (caught) {
    runState.status = "failed";
    runState.phase = "idle";
    runState.lastError = friendlyMessage(caught, "画像刷新失败，请重试。");
    throw new Error(runState.lastError);
  }
}

/**
 * 每个视角（all + 各岗位）各总结一次，与本地版 refreshCandidateProfile 的循环同口径：
 * 1 场面试即可合成"初步印象"；一个视角一次模型调用。
 */
async function synthesizeAllViews(): Promise<void> {
  const workspace = currentWorkspace();
  const profile = trialProfile(workspace);
  const interviews = new Map(workspace.interviews.map((interview) => [interview.id, interview]));
  const views: TrialSynthesizedView[] = [];
  for (const roleKey of ["all", ...trialRoles(workspace).map((role) => role.key)]) {
    const metrics = trialProfileMetrics(workspace, roleKey);
    const eligibleMetrics = metrics.filter((metric) => metric.interviewCount >= 1);
    if (eligibleMetrics.length === 0) continue;
    const eligibleDimensions = new Set(eligibleMetrics.map((metric) => metric.dimension));
    const insights = await synthesizeInsights({
      roleKey,
      metrics: eligibleMetrics,
      observations: profile.observations
        .filter((observation) => {
          const interview = interviews.get(observation.interviewId);
          return (
            observation.status === "active" &&
            interview !== undefined &&
            (roleKey === "all" || trialRoleKey(interview) === roleKey) &&
            eligibleDimensions.has(observation.dimension as (typeof eligibleMetrics)[number]["dimension"])
          );
        })
        .slice(0, 120),
      lockedInsights: profile.insights.filter((insight) => insight.isUserLocked && (insight.roleKey ?? "all") === roleKey),
    });
    views.push({
      roleKey,
      metrics,
      insights: insights.map((insight) => ({
        dimension: insight.dimension,
        kind: insight.kind,
        title: insight.title,
        statement: insight.statement,
        evidence: insight.evidence,
      })),
    });
  }
  if (views.length > 0) mutateWorkspace((current) => applyTrialSynthesis(current, views));
}

/** 是否该自动跑一轮：有未评估的已完成面试，且上一轮没有在跑也没有失败。 */
export function shouldAutoRefreshTrialProfile(): boolean {
  return (
    runState.status === "idle" &&
    pendingAssessmentInterviews(currentWorkspace()).length > 0
  );
}

export function createTrialProfileTransport(): CandidateProfileTransport {
  return {
    async fetchStatus() {
      const profile = trialProfile(currentWorkspace());
      return {
        status: runState.status === "running" ? "running" : runState.status,
        phase: runState.phase,
        revision: profile.revision,
        completedCount: runState.completedCount,
        totalCount: runState.totalCount,
        lastRefreshedAt: profile.refreshedAt,
        lastError: runState.lastError,
        needsFullRebuild: false,
      };
    },
    refresh: refreshTrialProfile,
    async correctObservation(id, body) {
      mutateWorkspace((current) =>
        correctTrialObservation(current, { id, ...body }),
      );
    },
    async updateInsight(id, body) {
      mutateWorkspace((current) => updateTrialInsight(current, { id, ...body }));
    },
    async mergeRoles(sourceKey, targetKey) {
      mutateWorkspace((current) => mergeTrialRoles(current, sourceKey, targetKey));
      // 与本地版一样，合并后重新总结（观察不变，只重跑洞察）。
      runState.status = "running";
      runState.phase = "synthesis";
      try {
        await synthesizeAllViews();
      } finally {
        runState.status = "idle";
        runState.phase = "idle";
      }
    },
  };
}
