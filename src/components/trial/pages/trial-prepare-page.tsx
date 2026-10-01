"use client";

import { InterviewPrepareView } from "@/components/interviews/interview-prepare-view";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { trialPrepareData } from "@/lib/trial/workspace-prepare";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

const messages = defineMessages({
  "zh-CN": {
    back: "返回面试记录",
    description: "备战页只对还没开始的真实面试开放，或者这条记录不在当前浏览器中。",
    title: "没有可备战的面试",
  },
  en: {
    back: "Back to interview records",
    description: "Prep is only available for real interviews that haven't happened yet, or this record isn't in this browser.",
    title: "No interview to prepare for",
  },
});

/** 体验版的真实面试备战页：从浏览器工作台取数，渲染与本地版相同的视图。 */
export function TrialPreparePage({ id }: { id: string }) {
  const workspace = useTrialWorkspace();
  const t = useMessages(messages);
  if (!workspace) return null;
  const data = trialPrepareData(workspace, id);
  if (!data) {
    return (
      <EmptyState
        action={<ButtonLink href="/interviews/history">{t.back}</ButtonLink>}
        description={t.description}
        title={t.title}
      />
    );
  }
  return <InterviewPrepareView data={data} />;
}
