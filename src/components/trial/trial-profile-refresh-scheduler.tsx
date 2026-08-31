"use client";

import { useEffect } from "react";

import { trialAiTokenDocument } from "@/lib/trial/browser-store";
import {
  refreshTrialProfile,
  shouldAutoRefreshTrialProfile,
} from "@/lib/trial/profile-actions";
import { useStoredDocument } from "@/lib/trial/stored-document";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 网页版的画像自动更新，对应本地版挂在同一位置的 ProfileRefreshScheduler。
 *
 * 本地版由服务端后台任务推进，网页版没有服务端状态，改为在浏览器里跑：
 * 挂在 AppShell 上，任何页面新增面试记录或完成模拟面试后（工作台文档变化）
 * 都会自动补齐评估，不需要用户特意打开能力画像页。
 *
 * 一轮只评估固定批次，剩下的靠工作台再次变化触发下一轮；
 * 失败后停在 failed 不再自动重试，避免 Key 不对时反复消耗访客额度
 * （画像页上有手动重试按钮）。
 */
export function TrialProfileRefreshScheduler() {
  const workspace = useTrialWorkspace();
  const aiReady = useStoredDocument(trialAiTokenDocument) !== null;

  useEffect(() => {
    if (!workspace || !aiReady) return;
    if (!shouldAutoRefreshTrialProfile()) return;

    refreshTrialProfile().catch(() => {
      // 失败状态记在 runState 上，由画像页的状态条呈现。
    });
  }, [aiReady, workspace]);

  return null;
}
