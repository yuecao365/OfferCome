"use client";

import {
  GettingStartedChecklist,
  type SetupStep,
} from "@/components/dashboard/getting-started-checklist";
import { trialAiTokenDocument } from "@/lib/trial/browser-store";
import { useStoredDocument } from "@/lib/trial/stored-document";
import type { TrialWorkspace } from "@/lib/trial/workspace";

/**
 * 网页版的开始清单：步骤与本地版一致，完成状态从浏览器数据推导。
 * （Boss 同步是本地版专属，投递一步只保留手动新建。）
 */
export function TrialGettingStartedCard({
  workspace,
}: {
  workspace: TrialWorkspace;
}) {
  const aiReady = useStoredDocument(trialAiTokenDocument) !== null;

  const steps: SetupStep[] = [
    {
      done: aiReady,
      label: "连接你的模型服务",
      hint: "AI 模拟面试、解析和画像都依赖它",
      href: "/settings",
    },
    {
      done: workspace.resume !== null,
      label: "上传一份简历",
      hint: "出题和能力画像的核心素材",
      href: "/resumes",
    },
    {
      done: workspace.applications.length > 0,
      label: "添加投递记录",
      hint: "手动新建正在投的岗位",
      href: "/applications",
    },
    {
      done: workspace.interviews.some(
        (interview) => interview.kind === "mock" && interview.status === "completed",
      ),
      label: "完成第一次 AI 模拟面试",
      hint: "获得有证据支持的评分与建议",
      href: "/interviews/mock",
    },
  ];

  return <GettingStartedChecklist steps={steps} />;
}
