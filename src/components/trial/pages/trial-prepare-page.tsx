"use client";

import { InterviewPrepareView } from "@/components/interviews/interview-prepare-view";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { trialPrepareData } from "@/lib/trial/workspace-prepare";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

/** 体验版的真实面试备战页：从浏览器工作台取数，渲染与本地版相同的视图。 */
export function TrialPreparePage({ id }: { id: string }) {
  const workspace = useTrialWorkspace();
  if (!workspace) return null;
  const data = trialPrepareData(workspace, id);
  if (!data) {
    return (
      <EmptyState
        action={<ButtonLink href="/interviews/history">返回面试记录</ButtonLink>}
        description="备战页只对还没开始的真实面试开放，或者这条记录不在当前浏览器中。"
        title="没有可备战的面试"
      />
    );
  }
  return <InterviewPrepareView data={data} />;
}
