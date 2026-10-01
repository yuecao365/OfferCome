"use client";

import { useSearchParams } from "next/navigation";

import { InterviewReviewView } from "@/components/interviews/interview-review-view";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { parseInterviewReviewFilters } from "@/lib/interviews/review";
import { reclassifyTrialQuestions, trialReviewPageData } from "@/lib/trial/workspace-review";
import { mutateWorkspace, useTrialWorkspace } from "@/lib/trial/workspace-store";

const messages = defineMessages({
  "zh-CN": {
    missingProject: "选择的实习/项目不存在，请刷新后重试。",
    reclassified: (n: number) => `已重新归类 ${n} 条历史记录。`,
  },
  en: {
    missingProject: "The selected internship / project no longer exists. Refresh and try again.",
    reclassified: (n: number) => `Reclassified ${n} past record${n === 1 ? "" : "s"}.`,
  },
});

/**
 * 体验版的面试复盘页：与本地版渲染同一个 InterviewReviewView，
 * 聚合与分页复用本地版纯函数，归类动作写回浏览器工作台。
 */
export function TrialReviewPage() {
  const searchParams = useSearchParams();
  const workspace = useTrialWorkspace();
  const t = useMessages(messages);

  const filters = parseInterviewReviewFilters(
    Object.fromEntries(searchParams.entries()),
  );

  if (!workspace) {
    // 首帧（SSR/未水合）还读不到浏览器数据，水合后立即补齐。
    return null;
  }

  return (
    <InterviewReviewView
      data={trialReviewPageData(workspace, filters)}
      filters={filters}
      reclassifyAction={async (input) => {
        let count = 0;
        let missingProject = false;
        mutateWorkspace((current) => {
          const result = reclassifyTrialQuestions(current, input);
          count = result.count;
          missingProject = result.missingProject;
          return result.workspace;
        });
        if (missingProject) {
          return {
            status: "error",
            message: t.missingProject,
          };
        }
        return { status: "success", message: t.reclassified(count) };
      }}
    />
  );
}
