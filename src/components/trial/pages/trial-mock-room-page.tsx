"use client";

import { useEffect, useMemo } from "react";

import { MockInterviewChat, type MockInterviewChatDriver } from "@/components/interviews/mock-interview-chat";
import type { GenerationProgressDriver } from "@/components/interviews/mock-interview-generation-progress";
import { MockInterviewSessionView } from "@/components/interviews/mock-interview-session-view";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { readTrialInterview, trialInterviewsDocument } from "@/lib/trial/browser-store";
import {
  applyTrialTurn,
  completeTrialMockSession,
  createTrialChatTransport,
  deleteTrialMockSession,
  retryTrialGeneration,
  runGeneration,
} from "@/lib/trial/mock-actions";
import { trialInterviewToView } from "@/lib/trial/mock-view";
import { useStoredDocument } from "@/lib/trial/stored-document";

/**
 * 网页版的单场模拟面试页：读浏览器里的会话文档，渲染与本地版相同的
 * 进度卡 / 全屏房间 / 报告页；备课、回合落地、评分与交卷都在这个页面里驱动。
 */
export function TrialMockRoomPage({ id }: { id: string }) {
  const table = useStoredDocument(trialInterviewsDocument);
  const interview = table?.[id] ?? null;

  // 备课在页面里跑：进入房间发现还在 generating 就接着跑（刷新页面或重新打开也能续上）。
  useEffect(() => {
    if (interview?.status === "generating") void runGeneration(id);
  }, [id, interview?.status]);

  const generationDriver = useMemo<GenerationProgressDriver>(
    () => ({
      poll: async () => {
        const current = readTrialInterview(id);
        return {
          status: current?.status ?? "generation_failed",
          generationPhase: current?.generationPhase ?? null,
          error: current?.generationError ?? (current ? null : "这场面试不在当前浏览器中。"),
        };
      },
      retry: () => retryTrialGeneration(id),
    }),
    [id],
  );

  // 传输只依赖会话 id（状态每次请求现读），只在"能开房"这个条件翻转时重建。
  const canChat = interview !== null && interview.status !== "generating" && interview.status !== "generation_failed";
  const chatDriver = useMemo<MockInterviewChatDriver | null>(
    () =>
      canChat
        ? {
            transport: createTrialChatTransport(id),
            onTurn: (payload) => applyTrialTurn(id, payload),
            finish: () => completeTrialMockSession(id),
          }
        : null,
    [canChat, id],
  );

  if (!interview) {
    // 首帧（SSR/未水合）还读不到浏览器数据，水合后立即补齐。
    if (!table) return null;
    return (
      <EmptyState
        action={<ButtonLink href="/interviews/mock">返回模拟面试列表</ButtonLink>}
        description="这场面试不在当前浏览器中。网页版的数据只保存在你自己的浏览器里，换设备或清除站点数据后无法恢复。"
        title="没有找到这场模拟面试"
      />
    );
  }

  const session = trialInterviewToView(interview);
  // 进行中与评分中的对话式面试独占整个视口；文档一变（报告写入）自动切回带导航的报告视图。
  if (session.conversation && session.status !== "completed" && chatDriver) {
    return (
      <MockInterviewChat
        driver={chatDriver}
        onCompleted={() => {}}
        session={{ ...session, conversation: session.conversation }}
      />
    );
  }

  return (
    <MockInterviewSessionView
      deleteAction={async () => {
        deleteTrialMockSession(id);
        window.location.assign("/interviews/mock");
      }}
      generationDriver={generationDriver}
      onReady={() => {}}
      session={session}
    />
  );
}
