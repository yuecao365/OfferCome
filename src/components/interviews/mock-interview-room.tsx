"use client";

import { Keyboard, Loader2, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldLabel, Textarea } from "@/components/ui/form-controls";
import { INTERVIEW_QUESTION_CATEGORY_LABELS } from "@/lib/interviews/types";
import {
  MOCK_INTERVIEW_MODE_LABELS,
  type MockInterviewMode,
  type MockInterviewView,
} from "@/lib/mock-interviews/types";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import { MockInterviewReport } from "./mock-interview-report";
import { MockInterviewVoiceControls } from "./mock-interview-voice-controls";

/** 提交一题后的会话推进结果，形状与本地版 answer API 的响应一致。 */
export type MockInterviewAnswerOutcome = {
  status: string;
  currentQuestionIndex: number;
  questionCount: number;
  nextQuestion: {
    id: string;
    question: string;
    category: string;
    sortOrder: number;
    isFollowUp: boolean;
  } | null;
};

/**
 * 房间的数据通道。默认实现走本地版 API + 服务端存储；
 * 体验版注入浏览器实现（无状态计算 API + sessionStorage）。
 */
export type MockInterviewRoomTransport = {
  submitAnswer(input: {
    questionId: string;
    answer?: string;
    skip: boolean;
  }): Promise<MockInterviewAnswerOutcome>;
  complete(): Promise<void>;
  /** 报告生成完成后的刷新方式；默认 router.refresh() 重取服务端视图。 */
  onCompleted?: () => void;
  /** 语音作答依赖服务端转写，体验版关闭。 */
  voiceEnabled: boolean;
};

function createDefaultTransport(sessionId: string): MockInterviewRoomTransport {
  return {
    async submitAnswer(input) {
      const response = await fetch(`/api/interviews/mock/${sessionId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = (await response.json()) as Partial<MockInterviewAnswerOutcome> & {
        error?: string;
      };
      if (!response.ok || typeof result.currentQuestionIndex !== "number") {
        throw new Error(result.error ?? "提交回答失败。");
      }
      return {
        status: result.status ?? "in_progress",
        currentQuestionIndex: result.currentQuestionIndex,
        questionCount: result.questionCount ?? 0,
        nextQuestion: result.nextQuestion ?? null,
      };
    },
    async complete() {
      const response = await fetch(`/api/interviews/mock/${sessionId}/complete`, {
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "生成面试报告失败。");
    },
    voiceEnabled: true,
  };
}

type QuestionProgressState = "current" | "skipped" | "answered" | "pending";

const PROGRESS_STATE_LABELS: Record<QuestionProgressState, string> = {
  current: "当前",
  skipped: "已跳过",
  answered: "已答",
  pending: "未答",
};

const PROGRESS_STATE_CLASSES: Record<QuestionProgressState, string> = {
  current: "border-brand bg-accent ring-2 ring-brand/20",
  skipped: "border-warning bg-warning-soft",
  answered: "border-brand bg-brand",
  pending: "border-border bg-muted",
};

/**
 * 进度格的状态。只表示"作答到哪了"——是不是追问由格子的形状（更窄 + 虚线）
 * 单独表达，两者正交，已回答的追问才不会被画成普通的已答题。
 */
export function questionProgressState(
  question: { skipped: boolean },
  index: number,
  currentIndex: number,
): QuestionProgressState {
  if (index === currentIndex) return "current";
  if (index > currentIndex) return "pending";
  return question.skipped ? "skipped" : "answered";
}

function categoryLabel(value: string): string {
  return (
    INTERVIEW_QUESTION_CATEGORY_LABELS[
      value as keyof typeof INTERVIEW_QUESTION_CATEGORY_LABELS
    ] ?? "面试问题"
  );
}

export function MockInterviewRoom({
  initial,
  transport: transportOverride,
}: {
  initial: MockInterviewView;
  transport?: MockInterviewRoomTransport;
}) {
  const router = useRouter();
  const transport = useMemo(
    () => transportOverride ?? createDefaultTransport(initial.id),
    [initial.id, transportOverride],
  );
  const [currentIndex, setCurrentIndex] = useState(initial.currentQuestionIndex);
  const [questions, setQuestions] = useState(initial.questions);
  const [questionCount, setQuestionCount] = useState(initial.questionCount);
  const [status, setStatus] = useState(initial.status);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<MockInterviewMode>(initial.interactionMode);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState("");
  const [insertedFollowUpId, setInsertedFollowUpId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  const handleTranscript = useCallback((transcript: string) => {
    setAnswer((current) =>
      current.trim() ? `${current.trim()}\n${transcript}` : transcript,
    );
    setError("");
  }, []);

  const visibleQuestions = questions.slice(0, questionCount);
  const currentQuestion = questions[currentIndex] ?? null;
  const draftStorageKey = currentQuestion
    ? `mock-answer:${initial.id}:${currentQuestion.id}`
    : null;

  useEffect(() => {
    if (!draftStorageKey) return;
    const timeout = window.setTimeout(() => {
      setAnswer(window.localStorage.getItem(draftStorageKey) ?? "");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey) return;
    const timeout = window.setTimeout(() => {
      if (answer) {
        window.localStorage.setItem(draftStorageKey, answer);
      } else {
        window.localStorage.removeItem(draftStorageKey);
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [answer, draftStorageKey]);

  useEffect(() => {
    if (!insertedFollowUpId || reducedMotion) return;
    const timeout = window.setTimeout(() => setInsertedFollowUpId(null), 320);
    return () => window.clearTimeout(timeout);
  }, [insertedFollowUpId, reducedMotion]);

  if (initial.status === "completed") {
    return <MockInterviewReport session={initial} />;
  }

  const advanceQuestion = async (skip: boolean) => {
    if (!currentQuestion) return;
    setPending(true);
    setError("");
    try {
      const result = await transport.submitAnswer({
        questionId: currentQuestion.id,
        answer: skip ? undefined : answer,
        skip,
      });
      setQuestions((current) =>
        current.map((question) =>
          question.id === currentQuestion.id
            ? { ...question, answer: skip ? "" : answer, skipped: skip }
            : question,
        ),
      );
      setCurrentIndex(result.currentQuestionIndex);
      if (result.questionCount > 0) setQuestionCount(result.questionCount);
      if (result.nextQuestion && !questions.some((item) => item.id === result.nextQuestion!.id)) {
        if (result.nextQuestion.isFollowUp) {
          setInsertedFollowUpId(result.nextQuestion.id);
        }
        setQuestions((current) => {
          const next = [...current];
          next.splice(result.nextQuestion!.sortOrder, 0, {
            ...result.nextQuestion!,
            answer: "",
            skipped: false,
            parentQuestionId: currentQuestion.id,
            teaching: undefined,
            evaluation: null,
          });
          return next;
        });
      }
      setStatus(result.status);
      if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
      setAnswer("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交回答失败。");
    } finally {
      setPending(false);
    }
  };

  const submitAnswer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await advanceQuestion(false);
  };

  const skipQuestion = async () => {
    if (!window.confirm("确认跳过这道题吗？跳过后将按 0 分计入总分。")) {
      return;
    }
    await advanceQuestion(true);
  };

  const complete = async () => {
    setPending(true);
    setError("");
    setStatus("evaluating");
    try {
      await transport.complete();
      (transport.onCompleted ?? (() => router.refresh()))();
    } catch (completeError) {
      setStatus("ready_to_evaluate");
      setError(
        completeError instanceof Error ? completeError.message : "生成面试报告失败。",
      );
    } finally {
      setPending(false);
    }
  };

  if (status === "ready_to_evaluate" || status === "evaluating") {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground">全部题目已完成</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          逐题评分已经在作答过程中完成，现在只需汇总本场表现。
        </p>
        <Button
          className="mt-4"
          disabled={pending || status === "evaluating"}
          onClick={complete}
          type="button"
        >
          {pending || status === "evaluating" ? (
            <>
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              正在汇总…
            </>
          ) : "生成面试报告"}
        </Button>
        {error ? <Alert className="mt-3" tone="danger">{error}</Alert> : null}
      </Card>
    );
  }

  if (!currentQuestion) {
    return <EmptyState description="刷新页面后仍无法恢复时，请返回模拟面试列表重新进入。" title="没有找到当前题目" />;
  }

  return (
    <div className="grid gap-5">
      <Card aria-label="面试进度" className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground">问题 {currentIndex + 1} / {questionCount}</span>
            <Badge tone="info">{MOCK_INTERVIEW_MODE_LABELS[mode]}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-1 text-muted-foreground">已完成 {currentIndex} 题</span>
            <Button
              aria-pressed={mode === "text"}
              disabled={pending || voiceBusy}
              onClick={() => setMode("text")}
              size="sm"
              type="button"
              variant={mode === "text" ? "secondary" : "ghost"}
            >
              <Keyboard aria-hidden="true" className="size-4" />
              文字
            </Button>
            {transport.voiceEnabled ? (
              <Button
                aria-pressed={mode === "voice"}
                disabled={pending || voiceBusy}
                onClick={() => setMode("voice")}
                size="sm"
                type="button"
                variant={mode === "voice" ? "secondary" : "ghost"}
              >
                <Mic aria-hidden="true" className="size-4" />
                语音
              </Button>
            ) : null}
          </div>
        </div>
        <ol
          aria-label={`面试进度，已完成 ${currentIndex} 题，共 ${questionCount} 题`}
          className="mt-3 grid gap-1.5"
          // 追问占更窄一格，视觉上"附属"于它追问的那道主题目。
          style={{
            gridTemplateColumns: visibleQuestions
              .map((question) =>
                question.isFollowUp ? "minmax(0, 0.45fr)" : "minmax(0, 1fr)",
              )
              .join(" "),
          }}
        >
          {visibleQuestions.map((question, index) => {
            const state = questionProgressState(question, index, currentIndex);
            return (
              <li
                aria-current={state === "current" ? "step" : undefined}
                aria-label={`${question.isFollowUp ? "追问" : `问题 ${index + 1}`}，${PROGRESS_STATE_LABELS[state]}`}
                className={`h-2.5 rounded-full border ${PROGRESS_STATE_CLASSES[state]} ${
                  question.isFollowUp ? "border-dashed" : ""
                }`}
                key={question.id}
              />
            );
          })}
        </ol>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><i className="mr-1 inline-block size-2 rounded-full bg-brand" />已答</span>
          <span><i className="mr-1 inline-block size-2 rounded-full bg-accent ring-1 ring-brand" />当前</span>
          <span><i className="mr-1 inline-block size-2 rounded-full bg-warning-soft ring-1 ring-warning" />已跳过</span>
          <span>
            <i className="mr-1 inline-block h-2 w-3 rounded-full border border-dashed border-muted-foreground" />
            追问（窄格，颜色同样表示作答状态）
          </span>
        </div>
      </Card>

      <Card
        className={`p-5 ${
          currentQuestion.isFollowUp && insertedFollowUpId === currentQuestion.id && !reducedMotion
            ? "animate-follow-up-enter"
            : ""
        }`}
      >
      <form className="grid gap-4" onSubmit={submitAnswer}>
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{categoryLabel(currentQuestion.category)}</Badge>
            {currentQuestion.isFollowUp ? <Badge tone="brand">追问</Badge> : null}
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-7 text-foreground">{currentQuestion.question}</h3>
        </div>
        {mode === "voice" ? (
          <MockInterviewVoiceControls
            disabled={pending}
            onBusyChange={setVoiceBusy}
            onError={setError}
            onTranscript={handleTranscript}
            question={currentQuestion.question}
            questionId={currentQuestion.id}
            sessionId={initial.id}
          />
        ) : null}
        <FieldLabel className="text-sm">
          {mode === "voice" ? "语音转写（可编辑）" : "你的回答"}
          <Textarea
            autoFocus={mode === "text"}
            className="min-h-56"
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              mode === "voice"
                ? "录音转写结果会显示在这里。请检查并修改后再提交。"
                : "像正式面试一样组织你的回答。可以使用 Ctrl/⌘ + Enter 提交。"
            }
            required
            value={answer}
          />
        </FieldLabel>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={pending || voiceBusy || !answer.trim()}
            type="submit"
          >
            {pending ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                正在保存…
              </>
            ) : currentIndex + 1 === questionCount ? "提交最后一题" : "提交并进入下一题"}
          </Button>
          <Button
            disabled={pending || voiceBusy}
            onClick={skipQuestion}
            type="button"
            variant="outline"
          >
            跳过这题
          </Button>
          <span className="text-xs text-muted-foreground">提交后将保存进度，刷新页面也可以继续。</span>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </form>
      </Card>
    </div>
  );
}
