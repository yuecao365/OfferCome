"use client";

import { InterviewDeleteButton } from "@/components/interviews/interview-delete-button";
import { MockInterviewBubble } from "@/components/interviews/mock-interview-chat";
import {
  MockInterviewGenerationProgress,
  type GenerationProgressDriver,
} from "@/components/interviews/mock-interview-generation-progress";
import { MockInterviewReport } from "@/components/interviews/mock-interview-report";
import { useMockInterviewDeleteConfirm } from "@/components/interviews/mock-interviews-view";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import type { MockInterviewView } from "@/lib/mock-interviews/types";

const messages = defineMessages({
  "zh-CN": {
    backToList: "返回模拟面试列表",
    transcript: "对话记录",
    restart: "重新发起一场",
    unavailableDescription: "这场面试还没有报告：评分没有完成，或数据已不完整。",
    unavailableTitle: "这场面试暂时无法查看",
  },
  en: {
    backToList: "Back to mock interviews",
    transcript: "Transcript",
    restart: "Start a new one",
    unavailableDescription: "This interview has no report yet: scoring didn't finish, or the data is incomplete.",
    unavailableTitle: "This interview can't be viewed right now",
  },
});

/**
 * 单场模拟面试页的呈现层。本地版与体验版渲染同一棵组件树，
 * 差别只在注入的删除动作与备课进度来源。
 *
 * 进行中的对话式面试不经过这里（页面直接渲染全屏房间）；这里只负责备课中、
 * 已完成（报告 + 对话记录）这几种带导航的状态。
 */
export function MockInterviewSessionView({
  session,
  deleteAction,
  generationDriver,
  onReady,
}: {
  session: MockInterviewView;
  /** 体验版在此注入浏览器删除动作。 */
  deleteAction?: (formData: FormData) => Promise<void>;
  /** 体验版在此注入浏览器里的备课进度来源。 */
  generationDriver?: GenerationProgressDriver;
  onReady?: () => void;
}) {
  const t = useMessages(messages);
  const deleteConfirm = useMockInterviewDeleteConfirm();
  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink href="/interviews/mock" variant="outline">
              {t.backToList}
            </ButtonLink>
            <InterviewDeleteButton
              action={deleteAction}
              confirmMessage={deleteConfirm(session.status)}
              id={session.interviewId}
              redirectTo="/interviews/mock"
            />
          </>
        }
        title={`${session.companyName} · ${session.jobTitle}`}
      />
      {session.status === "generating" || session.status === "generation_failed" ? (
        <MockInterviewGenerationProgress
          driver={generationDriver}
          initial={{
            status: session.status,
            generationPhase: session.generationPhase,
            error: session.generationError,
            errorCode: session.generationErrorCode,
          }}
          onReady={onReady}
          sessionId={session.id}
        />
      ) : session.conversation && session.report ? (
        <div className="grid gap-6">
          <MockInterviewReport session={session} />
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">{t.transcript}</summary>
            <div className="mt-4 grid gap-3">
              {session.conversation.messages.map((message) => (
                <MockInterviewBubble key={message.id} message={message} />
              ))}
            </div>
          </details>
        </div>
      ) : (
        <EmptyState
          action={<ButtonLink href="/interviews/mock">{t.restart}</ButtonLink>}
          description={t.unavailableDescription}
          title={t.unavailableTitle}
        />
      )}
    </>
  );
}
