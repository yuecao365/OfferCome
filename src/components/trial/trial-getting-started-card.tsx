"use client";

import {
  GettingStartedChecklist,
  type SetupStep,
} from "@/components/dashboard/getting-started-checklist";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { trialAiTokenDocument } from "@/lib/trial/browser-store";
import { useStoredDocument } from "@/lib/trial/stored-document";
import type { TrialWorkspace } from "@/lib/trial/workspace";

const messages = defineMessages({
  "zh-CN": {
    connect: { label: "连接你的模型服务", hint: "AI 模拟面试、解析和画像都依赖它" },
    resume: { label: "上传一份简历", hint: "出题和能力画像的核心素材" },
    application: { label: "添加投递记录", hint: "手动新建正在投的岗位" },
    mock: { label: "完成第一次 AI 模拟面试", hint: "获得有证据支持的评分与建议" },
  },
  en: {
    connect: { label: "Connect your model service", hint: "AI mock interviews, parsing and the skill profile all need it" },
    resume: { label: "Upload a resume", hint: "The core material for questions and the skill profile" },
    application: { label: "Add an application", hint: "Add the roles you're applying to" },
    mock: { label: "Finish your first AI mock interview", hint: "Get evidence-backed scores and advice" },
  },
});

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
  const t = useMessages(messages);

  const steps: SetupStep[] = [
    {
      done: aiReady,
      ...t.connect,
      href: "/settings",
    },
    {
      done: workspace.resume !== null,
      ...t.resume,
      href: "/resumes",
    },
    {
      done: workspace.applications.length > 0,
      ...t.application,
      href: "/applications",
    },
    {
      done: workspace.interviews.some(
        (interview) => interview.kind === "mock" && interview.status === "completed",
      ),
      ...t.mock,
      href: "/interviews/mock",
    },
  ];

  return <GettingStartedChecklist steps={steps} />;
}
