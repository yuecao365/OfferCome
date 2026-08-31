"use client";

import { useSearchParams } from "next/navigation";

import { ApplicationsView } from "@/components/applications-view";
import { parseApplicationFilters } from "@/lib/applications/types";
import {
  createTrialApplication,
  deleteTrialApplication,
  updateTrialApplication,
} from "@/lib/trial/application-actions";
import { createTrialInterviewRecord } from "@/lib/trial/interview-actions";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";
import { applicationSources, queryApplications } from "@/lib/trial/workspace";

/**
 * 体验版的投递页：与本地版渲染同一个 ApplicationsView，唯一的差别是
 * 数据来自浏览器工作台、动作写回浏览器工作台。
 */
export function TrialApplicationsPage() {
  const searchParams = useSearchParams();
  const workspace = useTrialWorkspace();

  const filters = parseApplicationFilters(
    Object.fromEntries(searchParams.entries()),
  );
  // 首帧（SSR/未水合）还读不到浏览器数据，渲染空列表占位，水合后立即补齐。
  const applications = workspace
    ? queryApplications(workspace, filters)
    : { items: [], page: 1, total: 0, totalPages: 1 };

  return (
    <ApplicationsView
      applications={applications}
      filters={filters}
      interviewContext={{
        resumeProjects: [],
        transcriptionConfigured: false,
        newInterview: {
          action: createTrialInterviewRecord,
          draftImportEnabled: false,
        },
      }}
      newApplication={{ action: createTrialApplication }}
      sources={workspace ? applicationSources(workspace) : []}
      table={{
        editActionFor: (id) => updateTrialApplication.bind(null, id),
        deleteActionFor: (id) => async () => deleteTrialApplication(id),
      }}
    />
  );
}
