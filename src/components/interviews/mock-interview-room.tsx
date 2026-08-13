"use client";

import { Keyboard, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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

import { MockInterviewReport } from "./mock-interview-report";
import { MockInterviewVoiceControls } from "./mock-interview-voice-controls";

function categoryLabel(value: string): string {
  return (
    INTERVIEW_QUESTION_CATEGORY_LABELS[
      value as keyof typeof INTERVIEW_QUESTION_CATEGORY_LABELS
    ] ?? "面试问题"
  );
}

export function MockInterviewRoom({ initial }: { initial: MockInterviewView }) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(initial.currentQuestionIndex);
  const [questions, setQuestions] = useState(initial.questions);
  const [questionCount, setQuestionCount] = useState(initial.questionCount);
  const [status, setStatus] = useState(initial.status);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<MockInterviewMode>(initial.interactionMode);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState("");

  const handleTranscript = useCallback((transcript: string) => {
    setAnswer((current) =>
      current.trim() ? `${current.trim()}\n${transcript}` : transcript,
    );
    setError("");
  }, []);

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

  if (initial.status === "completed") {
    return <MockInterviewReport session={initial} />;
  }

  const advanceQuestion = async (skip: boolean) => {
    if (!currentQuestion) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/interviews/mock/${initial.id}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          answer: skip ? undefined : answer,
          skip,
        }),
      });
      const result = (await response.json()) as {
        status?: string;
        currentQuestionIndex?: number;
        questionCount?: number;
        nextQuestion?: {
          id: string;
          question: string;
          category: string;
          sortOrder: number;
          isFollowUp: boolean;
        } | null;
        error?: string;
      };
      if (!response.ok || typeof result.currentQuestionIndex !== "number") {
        throw new Error(result.error ?? "提交回答失败。");
      }
      setCurrentIndex(result.currentQuestionIndex);
      if (typeof result.questionCount === "number") setQuestionCount(result.questionCount);
      if (result.nextQuestion && !questions.some((item) => item.id === result.nextQuestion!.id)) {
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
      setStatus(result.status ?? "in_progress");
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
      const response = await fetch(`/api/interviews/mock/${initial.id}/complete`, {
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "生成面试报告失败。");
      router.refresh();
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
          {pending || status === "evaluating" ? "正在汇总…" : "生成面试报告"}
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
          </div>
        </div>
        <progress className="mt-3 h-2 w-full accent-brand" max={questionCount} value={currentIndex}>
          {currentIndex}/{questionCount}
        </progress>
      </Card>

      <Card className="p-5">
      <form className="grid gap-4" onSubmit={submitAnswer}>
        <div>
          <Badge>{categoryLabel(currentQuestion.category)}</Badge>
          {currentQuestion.isFollowUp ? <Badge tone="brand">追问</Badge> : null}
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
            {pending ? "正在保存…" : currentIndex + 1 === questionCount ? "提交最后一题" : "提交并进入下一题"}
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
