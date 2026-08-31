"use client";

import { useMemo } from "react";

import { MockInterviewSessionView } from "@/components/interviews/mock-interview-session-view";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { trialInterviewDocument } from "@/lib/trial/browser-store";
import {
  createTrialRoomTransport,
  deleteTrialMockSession,
} from "@/lib/trial/mock-actions";
import { trialInterviewToView, trialMockRecordToView } from "@/lib/trial/mock-view";
import { useStoredDocument } from "@/lib/trial/stored-document";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 体验版的单场模拟面试页：进行中读 sessionStorage 会话文档，
 * 已完成读工作台记录，渲染与本地版相同的 MockInterviewSessionView。
 */
export function TrialMockRoomPage({ id }: { id: string }) {
  const workspace = useTrialWorkspace();
  const activeSession = useStoredDocument(trialInterviewDocument);
  const transport = useMemo(() => createTrialRoomTransport(), []);

  // 进行中的会话优先：它比工作台记录多保留了逐题维度评分与追问结构。
  const session =
    activeSession?.id === id
      ? trialInterviewToView(activeSession)
      : (() => {
          const record = workspace?.interviews.find(
            (item) => item.id === id && item.kind === "mock",
          );
          return record ? trialMockRecordToView(record) : null;
        })();

  if (!session) {
    // 首帧（SSR/未水合）还读不到浏览器数据，水合后立即补齐；
    // 真正找不到时多半是进行中的会话随标签页关闭被清掉了。
    if (!workspace) return null;
    return (
      <EmptyState
        action={<ButtonLink href="/interviews/mock">返回模拟面试列表</ButtonLink>}
        description="这场面试不在当前浏览器中。进行中的会话只保存在发起它的标签页，关闭后即清除。"
        title="没有找到这场模拟面试"
      />
    );
  }

  return (
    <MockInterviewSessionView
      deleteAction={async () => {
        deleteTrialMockSession(id);
        window.location.assign("/interviews/mock");
      }}
      session={session}
      transport={transport}
    />
  );
}
