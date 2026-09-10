import type { InterviewPrepareData } from "@/lib/interviews/prepare";
import { COMPANY_QUESTION_LIMIT, pickWeakDimensions } from "@/lib/interviews/prepare-rules";
import { groupQuestionReviewItems } from "@/lib/interviews/review";
import { normalizeInterviewRound } from "@/lib/interviews/types";

import type { TrialWorkspace } from "./workspace";
import { insightRoleKey, trialProfile, trialProfileMetrics, trialRoleKey } from "./workspace-profile";
import { questionReviewSources } from "./workspace-review";

/**
 * 体验版的真实面试备战页数据：与本地版 getInterviewPrepareData 同一口径——
 * 同一家公司问过的题（复用复盘的聚合）+ 这类岗位最弱的维度（岗位视角优先、回退到全局）。
 */
export function trialPrepareData(workspace: TrialWorkspace, interviewId: string): InterviewPrepareData | null {
  const interview = workspace.interviews.find((item) => item.id === interviewId);
  if (!interview || interview.kind !== "real" || interview.status !== "scheduled" || !interview.interviewedAt) {
    return null;
  }

  const companyQuestions = groupQuestionReviewItems(
    questionReviewSources(workspace, "real").filter(
      (row) => row.interview.companyName === interview.companyName && row.interview.id !== interview.id,
    ),
  ).slice(0, COMPANY_QUESTION_LIMIT);

  const insights = trialProfile(workspace).insights.filter(
    (insight) => insight.status === "active" && (insight.kind === "weakness" || insight.kind === "training_focus"),
  );
  let weakDimensions: InterviewPrepareData["weakDimensions"] = [];
  let weakDimensionScope: InterviewPrepareData["weakDimensionScope"] = "none";
  for (const [scope, roleKey] of [
    ["role", trialRoleKey(interview)],
    ["all", "all"],
  ] as const) {
    weakDimensions = pickWeakDimensions(
      trialProfileMetrics(workspace, roleKey),
      insights.filter((insight) => insightRoleKey(insight) === roleKey),
    );
    if (weakDimensions.length > 0) {
      weakDimensionScope = scope;
      break;
    }
  }

  return {
    interview: {
      id: interview.id,
      companyName: interview.companyName,
      jobTitle: interview.jobTitle,
      round: normalizeInterviewRound(interview.round),
      interviewedAt: new Date(interview.interviewedAt),
      applicationId: null,
      jobUrl: "",
    },
    companyQuestions,
    weakDimensions,
    weakDimensionScope,
  };
}
