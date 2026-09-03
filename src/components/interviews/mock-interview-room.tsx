"use client";

import { CornerDownRight, Keyboard, Loader2, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetaText } from "@/components/ui/data-table";
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
  current: "bg-accent-strong ring-1 ring-inset ring-brand",
  skipped: "bg-warning/50",
  answered: "bg-brand",
  pending: "bg-muted",
};

/**
 * 进度格的状态。只表示"作答到哪了"——是不是追问由格子的形状（长条 / 圆点）
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
        <h3 className="text-base font-semibold tracking-tight text-foreground">全部题目已完成</h3>
        <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-5 text-muted-foreground">
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
    <div className="grid gap-4">
      <section aria-label="面试进度" className="grid gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm tabular-nums text-foreground">
              {currentIndex + 1} / {questionCount}
            </span>
            <MetaText>{MOCK_INTERVIEW_MODE_LABELS[mode]}</MetaText>
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-pressed={mode === "text"}
              disabled={pending || voiceBusy}
              onClick={() => setMode("text")}
              size="sm"
              type="button"
              variant={mode === "text" ? "secondary" : "ghost"}
            >
              <Keyboard aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
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
                <Mic aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                语音
              </Button>
            ) : null}
          </div>
        </div>
        <ol
          aria-label={`面试进度，已完成 ${currentIndex} 题，共 ${questionCount} 题`}
          className="grid items-center gap-1"
          // 主题目是长条、追问是紧跟其后的小圆点：形状差异一眼可辨，
          // 又能看出追问从属于前一道主题目。
          style={{
            gridTemplateColumns: visibleQuestions
              .map((question) => (question.isFollowUp ? "0.625rem" : "minmax(0, 1fr)"))
              .join(" "),
          }}
        >
          {visibleQuestions.map((question, index) => {
            const state = questionProgressState(question, index, currentIndex);
            return (
              <li
                aria-current={state === "current" ? "step" : undefined}
                aria-label={`${question.isFollowUp ? "追问" : `问题 ${index + 1}`}，${PROGRESS_STATE_LABELS[state]}`}
                className={`h-1.5 rounded-full ${PROGRESS_STATE_CLASSES[state]} ${
                  question.isFollowUp ? "size-2.5 -ml-0.5" : ""
                }`}
                key={question.id}
              />
            );
          })}
        </ol>
        <p className="text-[0.6875rem] text-muted-foreground">
          长条是主题目，圆点是追问；实心为已答，描边为当前，浅色为已跳过。
        </p>
      </section>

      <Card
        className={`p-5 ${
          currentQuestion.isFollowUp && insertedFollowUpId === currentQuestion.id && !reducedMotion
            ? "animate-follow-up-enter"
            : ""
        }`}
      >
      <form className="grid gap-4" onSubmit={submitAnswer}>
        <div className="border-l-2 border-brand pl-4">
          <div className="flex flex-wrap items-center gap-2">
            <MetaText>{categoryLabel(currentQuestion.category)}</MetaText>
            {currentQuestion.isFollowUp ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CornerDownRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                追问 · 基于你上一题的回答
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-lg font-medium leading-7 tracking-tight text-foreground">{currentQuestion.question}</h3>
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
            variant="ghost"
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
