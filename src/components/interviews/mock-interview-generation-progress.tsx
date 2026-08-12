"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type GenerationState = {
  status: string;
  generationPhase: string | null;
  errorCode: string | null;
  error: string | null;
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
    if (next.status === "in_progress") router.refresh();
  }, [router, sessionId]);

  useEffect(() => {
    if (state.status !== "generating") return;
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 2_500);
    return () => window.clearInterval(interval);
  }, [refreshStatus, state.status]);

  const retry = async () => {
    setRetrying(true);
    try {
      const response = await fetch(
        `/api/interviews/mock/${sessionId}/retry-generation`,
        { method: "POST" },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "重试生成失败。");
      setState({
        status: "generating",
        generationPhase: "job_blueprint",
        errorCode: null,
        error: null,
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
            {state.error ?? "面试题生成失败，请稍后重试。"}
          </Alert>
          <Button disabled={retrying} onClick={retry} type="button">
            {retrying ? "正在重试…" : "重试生成"}
          </Button>
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
