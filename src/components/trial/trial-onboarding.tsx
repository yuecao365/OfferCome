"use client";

import { Sparkles } from "lucide-react";

import { TrialSetup } from "@/components/trial/trial-setup";
import { trialAiTokenDocument } from "@/lib/trial/browser-store";
import { useStoredDocument } from "@/lib/trial/stored-document";
import { setWorkspaceResume } from "@/lib/trial/workspace";
import { mutateWorkspace, useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 体验版的准备页容器：连接模型、保存简历内容，然后引导进入真实工作台。
 * 简历写入浏览器工作台（localStorage），模拟面试页从那里取出题素材。
 */
export function TrialOnboarding() {
  const workspace = useTrialWorkspace();
  const aiReady = useStoredDocument(trialAiTokenDocument) !== null;

  return (
    <div className="grid gap-4">
      <TrialSetup
        aiReady={aiReady}
        onResumeReady={(resume) =>
          mutateWorkspace((current) => setWorkspaceResume(current, resume))
        }
        resume={workspace?.resume ?? null}
      />
      <p className="text-xs text-muted-foreground">
        <Sparkles aria-hidden="true" className="mr-1 inline size-3" />
        简历与工作台数据只保存在当前浏览器；AI Key 保存在会话存储、关闭标签页即清除，
        随请求临时使用，服务器不存储任何数据。
      </p>
    </div>
  );
}
