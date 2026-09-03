import { InterviewDeleteButton } from "@/components/interviews/interview-delete-button";
import { MockInterviewGenerationProgress } from "@/components/interviews/mock-interview-generation-progress";
import { MockInterviewJdReview } from "@/components/interviews/mock-interview-jd-review";
import {
  MockInterviewRoom,
  type MockInterviewRoomTransport,
} from "@/components/interviews/mock-interview-room";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import {
  mockInterviewDeleteConfirmMessage,
  type MockInterviewView,
} from "@/lib/mock-interviews/types";

/**
 * 单场模拟面试页的呈现层。本地版与体验版渲染同一棵组件树，
 * 差别只在注入的删除动作与房间数据通道。
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
        description="按顺序完成问题，系统会保存回答并在结束后生成基于证据的评估。"
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
      ) : (
        <MockInterviewRoom initial={session} transport={transport} />
      )}
    </>
  );
}
