import { InterviewDeleteButton } from "@/components/interviews/interview-delete-button";
import { MockInterviewChat } from "@/components/interviews/mock-interview-chat";
import { MockInterviewGenerationProgress } from "@/components/interviews/mock-interview-generation-progress";
import { MockInterviewJdReview } from "@/components/interviews/mock-interview-jd-review";
import { MockInterviewReport } from "@/components/interviews/mock-interview-report";
import {
  MockInterviewRoom,
  type MockInterviewRoomTransport,
} from "@/components/interviews/mock-interview-room";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  mockInterviewDeleteConfirmMessage,
  type MockInterviewView,
} from "@/lib/mock-interviews/types";

/**
 * 单场模拟面试页的呈现层。本地版与体验版渲染同一棵组件树，
 * 差别只在注入的删除动作与房间数据通道。
 *
 * 本地版走对话式房间；体验版在 P2 同构前仍走旧的分步房间（transport 注入）。
 * 旧的分步会话没有简报：已完成的照常看报告，未完成的不再支持继续。
 */
export function MockInterviewSessionView({
  session,
  deleteAction,
  transport,
}: {
  session: MockInterviewView;
  /** 体验版在此注入浏览器删除动作。 */
  deleteAction?: (formData: FormData) => Promise<void>;
  transport?: MockInterviewRoomTransport;
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
      {session.status === "awaiting_jd_review" && session.jobDescriptionReview ? (
        <MockInterviewJdReview
          jobTitle={session.jobTitle}
          review={session.jobDescriptionReview}
          sessionId={session.id}
        />
      ) : session.status === "generating" || session.status === "generation_failed" ? (
        <MockInterviewGenerationProgress
          initial={{
            status: session.status,
            generationPhase: session.generationPhase,
            errorCode: session.generationErrorCode,
            error: session.generationError,
            errorContext: session.generationErrorContext,
            questionCount: session.questionCount,
            jobTitle: session.jobTitle,
          }}
          sessionId={session.id}
        />
      ) : session.conversation ? (
        <MockInterviewChat session={{ ...session, conversation: session.conversation }} />
      ) : transport ? (
        <MockInterviewRoom initial={session} transport={transport} />
      ) : session.status === "completed" && session.report ? (
        <MockInterviewReport session={session} />
      ) : (
        <EmptyState
          action={<ButtonLink href="/interviews/mock">重新发起一场</ButtonLink>}
          description="这场面试来自旧的分步流程，模拟面试已改为对话式，旧会话不再支持继续作答。"
          title="这场面试无法继续"
        />
      )}
    </>
  );
}
