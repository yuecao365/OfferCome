"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MockInterviewGenerationErrorContext } from "@/lib/mock-interviews/types";

type GenerationState = {
  status: string;
  generationPhase: string | null;
  errorCode: string | null;
  error: string | null;
  errorContext?: MockInterviewGenerationErrorContext | null;
  questionCount: number;
  jobTitle: string;
};

function phaseLabel(phase: string | null): string {
  if (phase === "questions" || phase === "persisting") {
    return "正在生成面试题";
  }
  return "正在分析岗位能力";
}

export function MockInterviewGenerationProgress({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: GenerationState;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [retrying, setRetrying] = useState(false);

  const refreshStatus = useCallback(async () => {
    const response = await fetch(`/api/interviews/mock/${sessionId}/status`, {
      cache: "no-store",
    });
    const next = (await response.json()) as GenerationState & { error?: string };
    if (!response.ok) throw new Error(next.error ?? "读取生成进度失败。");
    setState(next);
    if (next.status !== "generating") router.refresh();
  }, [router, sessionId]);

  useEffect(() => {
    if (state.status !== "generating") return;
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 2_500);
    return () => window.clearInterval(interval);
  }, [refreshStatus, state.status]);

  const retry = async (questionCount?: number, strategy?: "enrich") => {
    setRetrying(true);
    try {
      const response = await fetch(
        `/api/interviews/mock/${sessionId}/retry-generation`,
        {
          method: "POST",
          headers: questionCount || strategy ? { "Content-Type": "application/json" } : undefined,
          body: questionCount || strategy
            ? JSON.stringify({ questionCount, strategy })
            : undefined,
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "重试生成失败。");
      setState({
        status: "generating",
        generationPhase: "job_blueprint",
        errorCode: null,
        error: null,
        errorContext: null,
        questionCount: questionCount ?? state.questionCount,
        jobTitle: state.jobTitle,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "重试生成失败。",
      }));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Card className="p-6">
      {state.status === "generation_failed" ? (
        <div className="grid gap-4">
          <Alert tone="danger">
            <div>
              <p className="font-semibold">{state.error ?? "面试题生成没有完成。"}</p>
              {state.errorContext?.competencyCount !== undefined &&
              state.errorContext.requiredCount !== undefined ? (
                <p className="mt-1">
                  已识别 {state.errorContext.competencyCount} 项岗位能力，当前至少需要 {state.errorContext.requiredCount} 项。
                </p>
              ) : null}
              <p className="mt-1">你可以选择下面的操作继续，不需要反复提交相同内容。</p>
            </div>
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button disabled={retrying} onClick={() => retry()} type="button">
              {retrying ? "正在重新分析…" : "重新分析岗位描述"}
            </Button>
            {/* “AI 补全”只在缺题类失败时才真正有用：补全发生在出题之前，
                其他阶段的失败它救不了，展示出来只会造成无效的重复点击。 */}
            {state.errorCode === "question_validation_failed" ? (
              <Button
                disabled={retrying}
                onClick={() => retry(undefined, "enrich")}
                type="button"
                variant="outline"
              >
                让 AI 按“{state.jobTitle}”的常见要求补全
              </Button>
            ) : null}
            <Button
              disabled={retrying}
              onClick={() => retry(Math.max(3, Math.min(5, state.questionCount - 1)))}
              type="button"
              variant="outline"
            >
              减少到 {Math.max(3, Math.min(5, state.questionCount - 1))} 题重试
            </Button>
            <Button
              disabled={retrying}
              onClick={() => router.push("/interviews/mock")}
              type="button"
              variant="outline"
            >
              返回创建页
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-brand" />
          <div>
            <h3 className="font-semibold text-foreground">
              {phaseLabel(state.generationPhase)}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              可以离开或刷新页面，生成会在后台继续。
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
