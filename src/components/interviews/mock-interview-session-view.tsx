import { InterviewDeleteButton } from "@/components/interviews/interview-delete-button";
import { MockInterviewBubble } from "@/components/interviews/mock-interview-chat";
import {
  MockInterviewGenerationProgress,
  type GenerationProgressDriver,
} from "@/components/interviews/mock-interview-generation-progress";
import { MockInterviewReport } from "@/components/interviews/mock-interview-report";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  mockInterviewDeleteConfirmMessage,
  type MockInterviewView,
} from "@/lib/mock-interviews/types";

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
  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink href="/interviews/mock" variant="outline">
              返回模拟面试列表
            </ButtonLink>
            <InterviewDeleteButton
              action={deleteAction}
              confirmMessage={mockInterviewDeleteConfirmMessage(session.status)}
              id={session.interviewId}
              redirectTo="/interviews/mock"
            />
          </>
        }
        description="像真实面试一样对话：面试官会追问、给提示、切换话题；结束后生成基于证据的评估。"
        title={`${session.companyName} · ${session.jobTitle}`}
      />
      {session.status === "generating" || session.status === "generation_failed" ? (
        <MockInterviewGenerationProgress
          driver={generationDriver}
          initial={{
            status: session.status,
            generationPhase: session.generationPhase,
            error: session.generationError,
          }}
          onReady={onReady}
          sessionId={session.id}
        />
      ) : session.conversation && session.report ? (
        <div className="grid gap-6">
          <MockInterviewReport session={session} />
          <ButtonLink className="justify-self-start" href={`/interviews/mock/${session.id}/trace`} variant="outline">
            查看面试官的决策记录
          </ButtonLink>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">对话记录</summary>
            <div className="mt-4 grid gap-3">
              {session.conversation.messages.map((message) => (
                <MockInterviewBubble key={message.id} message={message} />
              ))}
            </div>
          </details>
        </div>
      ) : (
        <EmptyState
          action={<ButtonLink href="/interviews/mock">重新发起一场</ButtonLink>}
          description="这场面试还没有报告：评分没有完成，或数据已不完整。"
          title="这场面试暂时无法查看"
        />
      )}
    </>
  );
}
