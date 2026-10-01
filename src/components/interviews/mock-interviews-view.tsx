"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { InterviewDeleteButton } from "@/components/interviews/interview-delete-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages, type Locale } from "@/lib/i18n/locale";
import { INTERVIEW_PACE_LABELS_I18N, type InterviewPace } from "@/lib/mock-interviews/brief/brief";

const messages = defineMessages({
  "zh-CN": {
    title: "AI 模拟面试",
    recent: "最近的模拟面试",
    emptyTitle: "还没有模拟面试记录",
    emptyDescription: "配置目标岗位和岗位描述后，开始第一次针对性训练。",
    points: (n: number) => ` · ${n} 分`,
    coveredTopics: (n: number, pace: string) => `已考察 ${n} 个话题 · ${pace}`,
    topics: (n: number) => `${n} 个话题`,
    status: {
      completedUnanswered: "已完成 · 未作答",
      completed: "已完成",
      readyToEvaluate: "待出报告 · 点进去生成",
      evaluating: "评分中",
      generationFailed: "备课未完成",
      inProgress: "进行中 · 点进去继续",
    },
    deleteCompleted: "删除后这场模拟面试的报告和评分记录都会消失，确定删除吗？",
    deleteUnfinished: "这场模拟面试还没有完成，删除后已作答的内容和进度都会一起消失，确定删除吗？",
  },
  en: {
    title: "AI mock interview",
    recent: "Recent mock interviews",
    emptyTitle: "No mock interviews yet",
    emptyDescription: "Set a target role and job description, then start your first targeted practice.",
    points: (n: number) => ` · ${n} pts`,
    coveredTopics: (n: number, pace: string) => `${n} ${n === 1 ? "topic" : "topics"} covered · ${pace}`,
    topics: (n: number) => `${n} ${n === 1 ? "topic" : "topics"}`,
    status: {
      completedUnanswered: "Completed · no answers",
      completed: "Completed",
      readyToEvaluate: "Report pending · open to generate",
      evaluating: "Scoring",
      generationFailed: "Prep didn't finish",
      inProgress: "In progress · open to continue",
    },
    deleteCompleted: "Deleting removes this mock interview's report and scores. Delete it?",
    deleteUnfinished: "This mock interview isn't finished. Deleting removes your answers and progress too. Delete it?",
  },
});

type ListMessages = (typeof messages)["en"];

/** 删除确认语：列表行与单场页共用。 */
export function useMockInterviewDeleteConfirm(): (status: string) => string {
  const t = useMessages(messages);
  return (status) => (status === "completed" ? t.deleteCompleted : t.deleteUnfinished);
}

export type MockInterviewListItem = {
  /** 会话 id，用于房间链接。 */
  id: string;
  /** 删除目标（本地版是面试记录 id；体验版与会话 id 相同）。 */
  interviewId: string;
  status: string;
  questionCount: number;
  totalScore: number | null;
  companyName: string;
  jobTitle: string;
  /** 对话式会话带节奏；旧的分步会话与体验版没有。 */
  pace?: InterviewPace | null;
};

function progressLabel(session: MockInterviewListItem, t: ListMessages, locale: Locale): string {
  if (session.pace) return t.coveredTopics(session.questionCount, INTERVIEW_PACE_LABELS_I18N[locale][session.pace]);
  return t.topics(session.questionCount);
}

function statusLabel(session: MockInterviewListItem, t: ListMessages): string {
  const { status } = session;
  if (status === "completed") return session.questionCount === 0 ? t.status.completedUnanswered : t.status.completed;
  if (status === "ready_to_evaluate") return t.status.readyToEvaluate;
  if (status === "evaluating") return t.status.evaluating;
  if (status === "generation_failed") return t.status.generationFailed;
  return t.status.inProgress;
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
  const locale = useLocale();
  const t = useMessages(messages);
  const deleteConfirm = useMockInterviewDeleteConfirm();
  return (
    <>
      <PageHeader title={t.title} />

      {setup}

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t.recent}</h2>
        {recent.length === 0 ? (
          <EmptyState className="min-h-40" description={t.emptyDescription} title={t.emptyTitle} />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {recent.map((session) => (
              <div className="flex items-center gap-2" key={session.id}>
                <Link
                  className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-surface-subtle"
                  href={`/interviews/mock/${session.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {session.companyName} · {session.jobTitle}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {progressLabel(session, t, locale)}
                      {session.totalScore !== null ? t.points(session.totalScore) : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      session.status === "completed"
                        ? "success"
                        : session.status === "generation_failed"
                          ? "warning"
                          : "info"
                    }
                  >
                    {statusLabel(session, t)}
                  </Badge>
                </Link>
                <div className="shrink-0 pr-3">
                  <InterviewDeleteButton
                    action={deleteActionFor?.(session.interviewId)}
                    confirmMessage={deleteConfirm(session.status)}
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
