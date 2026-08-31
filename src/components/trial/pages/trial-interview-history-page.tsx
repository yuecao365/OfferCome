"use client";

import { useSearchParams } from "next/navigation";

import { InterviewHistoryView } from "@/components/interviews/interview-history-view";
import { parseInterviewFilters } from "@/lib/interviews/types";
import {
  createTrialInterviewRecord,
  deleteTrialInterviewRecord,
  updateTrialInterviewRecord,
} from "@/lib/trial/interview-actions";
import { queryInterviews } from "@/lib/trial/workspace-interviews";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 体验版的历史面试页：与本地版渲染同一个 InterviewHistoryView，
 * 数据来自浏览器工作台，动作写回浏览器工作台。
 * 录音/文本导入依赖服务端转写与落盘，体验版关闭（draftImportEnabled=false）。
 */
export function TrialInterviewHistoryPage() {
  const searchParams = useSearchParams();
  const workspace = useTrialWorkspace();

  const filters = parseInterviewFilters(
    Object.fromEntries(searchParams.entries()),
  );
  // 首帧（SSR/未水合）还读不到浏览器数据，渲染空列表占位，水合后立即补齐。
  const interviewPage = workspace
    ? queryInterviews(workspace, filters)
    : { interviews: [], total: 0, totalPages: 1, page: 1 };

  return (
    <InterviewHistoryView
      filters={filters}
      interviewPage={interviewPage}
      list={{
        editActionFor: (id) => updateTrialInterviewRecord.bind(null, id),
        deleteActionFor: (id) => async () => deleteTrialInterviewRecord(id),
      }}
      newInterview={{
        action: createTrialInterviewRecord,
        draftImportEnabled: false,
      }}
      resumeProjects={[]}
      transcriptionConfigured={false}
    />
  );
}
