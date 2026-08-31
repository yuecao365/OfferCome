import Link from "next/link";
import type { ReactNode } from "react";

import { InterviewDeleteButton } from "@/components/interviews/interview-delete-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { mockInterviewDeleteConfirmMessage } from "@/lib/mock-interviews/types";

export type MockInterviewListItem = {
  /** 会话 id，用于房间链接。 */
  id: string;
  /** 删除目标（本地版是面试记录 id；体验版与会话 id 相同）。 */
  interviewId: string;
  status: string;
  currentQuestionIndex: number;
  questionCount: number;
  totalScore: number | null;
  companyName: string;
  jobTitle: string;
};

function statusLabel(status: string): string {
  if (status === "completed") return "已完成";
  if (status === "ready_to_evaluate" || status === "evaluating") return "评分中";
  if (status === "awaiting_jd_review") return "待补充岗位信息";
  if (status === "generation_failed") return "生成未完成";
  return "进行中";
}

/**
 * AI 模拟面试列表页的呈现层。设置区由页面注入：本地版是接服务端
 * 的 MockInterviewSetup，体验版是注入浏览器实现的同一个组件。
 */
export function MockInterviewsView({
  setup,
  recent,
  deleteActionFor,
}: {
  setup: ReactNode;
  recent: MockInterviewListItem[];
  /** 体验版在此注入浏览器删除动作。 */
  deleteActionFor?: (interviewId: string) => (formData: FormData) => Promise<void>;
}) {
  return (
    <>
      <PageHeader
        description="结合目标岗位描述、所选简历、历史面试和已确认画像生成逐题训练，完成后获得有证据的评分与建议。"
        eyebrow="面试训练"
        title="AI 模拟面试"
      />

      {setup}

      <section className="grid gap-3">
        <h2 className="text-base font-semibold tracking-normal">最近的模拟面试</h2>
        {recent.length === 0 ? (
          <EmptyState className="min-h-40" description="配置目标岗位和岗位描述后，开始第一次针对性训练。" title="还没有模拟面试记录" />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {recent.map((session) => (
              <div className="flex items-center gap-2" key={session.id}>
                <Link
                  className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3.5 hover:bg-surface-subtle"
                  href={`/interviews/mock/${session.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {session.companyName} · {session.jobTitle}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      已回答 {Math.min(session.currentQuestionIndex, session.questionCount)}/{session.questionCount} 题
                      {session.totalScore !== null ? ` · ${session.totalScore} 分` : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      session.status === "completed"
                        ? "success"
                        : session.status === "awaiting_jd_review" ||
                            session.status === "generation_failed"
                          ? "warning"
                          : "info"
                    }
                  >
                    {statusLabel(session.status)}
                  </Badge>
                </Link>
                <div className="shrink-0 pr-3">
                  <InterviewDeleteButton
                    action={deleteActionFor?.(session.interviewId)}
                    confirmMessage={mockInterviewDeleteConfirmMessage(session.status)}
                    id={session.interviewId}
                  />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </>
  );
}
