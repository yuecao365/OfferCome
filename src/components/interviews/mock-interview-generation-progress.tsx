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
  error: string | null;
};

function phaseLabel(phase: string | null): string {
  if (phase === "brief") {
    return "面试官正在备课";
  }
  return "正在分析岗位能力";
}

/** 备课进度卡：轮询状态；失败时只有一个动作——从头重新备课。 */
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

  const retry = async () => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/interviews/mock/${sessionId}/retry-generation`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "重试生成失败。");
      setState({ status: "generating", generationPhase: "job_blueprint", error: null });
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
              <p className="font-semibold">{state.error ?? "面试准备没有完成。"}</p>
              <p className="mt-1">可以直接重试，不需要重新提交内容。</p>
            </div>
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button disabled={retrying} onClick={retry} type="button">
              {retrying ? "正在重新备课…" : "重新备课"}
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
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-muted-foreground" strokeWidth={1.5} />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {phaseLabel(state.generationPhase)}
            </h3>
            <p className="mt-1 text-[0.8125rem] text-muted-foreground">
              可以离开或刷新页面，生成会在后台继续。
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
