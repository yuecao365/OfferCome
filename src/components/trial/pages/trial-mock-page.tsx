"use client";

import { Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { MockInterviewSetup } from "@/components/interviews/mock-interview-setup";
import {
  MockInterviewsView,
  type MockInterviewListItem,
} from "@/components/interviews/mock-interviews-view";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { trialAiTokenDocument, trialInterviewDocument } from "@/lib/trial/browser-store";
import {
  createTrialMockSession,
  deleteTrialMockSession,
} from "@/lib/trial/mock-actions";
import { useStoredDocument } from "@/lib/trial/stored-document";
import { useTrialWorkspace } from "@/lib/trial/workspace-store";

/**
 * 体验版的 AI 模拟面试列表页：与本地版渲染同一个 MockInterviewsView，
 * 设置表单也是同一个 MockInterviewSetup，只是注入了浏览器实现。
 */
export function TrialMockPage() {
  const searchParams = useSearchParams();
  const workspace = useTrialWorkspace();
  const aiReady = useStoredDocument(trialAiTokenDocument) !== null;
  const activeSession = useStoredDocument(trialInterviewDocument);

  const resume = workspace?.resume ?? null;
  const ready = aiReady && resume !== null;

  // 从投递行发起时带入岗位信息（与本地版同一入口语义）。
  const applicationId = searchParams.get("applicationId");
  const linkedApplication = applicationId
    ? (workspace?.applications.find((item) => item.id === applicationId) ?? null)
    : null;
  const companyName = searchParams.get("companyName");
  const jobTitle = searchParams.get("jobTitle");
  const application = linkedApplication
    ? {
        id: null,
        companyName: linkedApplication.companyName,
        jobTitle: linkedApplication.jobTitle,
        jobUrl: linkedApplication.jobUrl ?? "",
        jobDescription: linkedApplication.jobDescription ?? "",
      }
    : companyName || jobTitle
      ? {
          id: null,
          companyName: companyName ?? "",
          jobTitle: jobTitle ?? "",
          jobUrl: "",
          jobDescription: "",
        }
      : null;

  const recent: MockInterviewListItem[] = [
    // 进行中的会话只存在当前标签页；完成后由工作台记录接管展示。
    ...(activeSession && activeSession.status !== "completed"
      ? [
          {
            id: activeSession.id,
            interviewId: activeSession.id,
            status: activeSession.status,
            currentQuestionIndex: activeSession.currentIndex,
            questionCount: activeSession.questions.length,
            totalScore: null,
            companyName: activeSession.job.companyName,
            jobTitle: activeSession.job.jobTitle,
          },
        ]
      : []),
    ...(workspace?.interviews ?? [])
      .filter((item) => item.kind === "mock")
      .map((item) => ({
        id: item.id,
        interviewId: item.id,
        status: "completed",
        currentQuestionIndex: item.questions.length,
        questionCount: item.questions.length,
        totalScore: item.totalScore,
        companyName: item.companyName,
        jobTitle: item.jobTitle,
      })),
  ];

  return (
    <MockInterviewsView
      deleteActionFor={(id) => async () => deleteTrialMockSession(id)}
      recent={recent}
      setup={
        ready ? (
          <MockInterviewSetup
            application={application}
            createSession={(formData) => createTrialMockSession(formData, resume)}
            jdFileEnabled={false}
            resumes={[
              {
                id: "trial-resume",
                name: workspace?.resumeMeta?.fileName ?? "体验简历（保存在本浏览器）",
                isDefault: true,
              },
            ]}
            textConfigured
            transcriptionConfigured={false}
            voiceDisabledHint="语音作答依赖本地版的转写服务，在线体验暂不支持。"
          />
        ) : (
          <EmptyState
            action={
              <ButtonLink href="/trial">
                <Sparkles aria-hidden="true" className="size-4" />
                去完成准备
              </ButtonLink>
            }
            description={
              aiReady
                ? "还差一步：提供你的简历内容（上传文件或填写表单），出题需要它。"
                : "两步准备：连接你自己的模型服务、提供简历内容。全部数据只保存在当前浏览器。"
            }
            title="先完成体验准备"
          />
        )
      }
    />
  );
}
