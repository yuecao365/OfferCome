"use client";

import { InterviewsWorkspaceView } from "@/components/interviews/interviews-workspace-view";
import { createTrialInterviewRecord } from "@/lib/trial/interview-actions";
import {
  applicationStageCounts,
  interviewWorkspaceOverview,
  upcomingInterviews,
} from "@/lib/trial/workspace-interviews";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 体验版的面试工作台：与本地版渲染同一个 InterviewsWorkspaceView。
 * 能力画像洞察在体验版属于后续阶段，先以空洞察渲染（摘要会自动降级为通用文案）。
 */
export function TrialInterviewsPage() {
  const workspace = useTrialWorkspace();

  if (!workspace) {
    // 首帧（SSR/未水合）还读不到浏览器数据，渲染空状态占位，水合后立即补齐。
    return null;
  }

  return (
    <InterviewsWorkspaceView
      insights={[]}
      newInterview={{
        action: createTrialInterviewRecord,
        draftImportEnabled: false,
      }}
      resumeProjects={[]}
      stageCounts={applicationStageCounts(workspace)}
      transcriptionConfigured={false}
      upcomingInterviews={upcomingInterviews(workspace)}
      workspace={interviewWorkspaceOverview(workspace)}
    />
  );
}
