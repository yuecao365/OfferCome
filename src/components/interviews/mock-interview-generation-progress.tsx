"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type GenerationState = {
  status: string;
  generationPhase: string | null;
  error: string | null;
  /** "degraded"：备课没成但简报已兜底，用户可以就这样开始。 */
  errorCode?: string | null;
};

/** 进度的来源：本地版轮询服务端状态，体验版读浏览器里的会话文档。 */
export type GenerationProgressDriver = {
  poll(): Promise<GenerationState>;
  retry(): Promise<void>;
  /** 没备好也开始（只在 errorCode 为 degraded 时出现）；体验版没有。 */
  accept?(): Promise<void>;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? fallback);
  return result;
}

export function createLocalGenerationDriver(sessionId: string): GenerationProgressDriver {
  return {
    poll: async () =>
      readJson<GenerationState>(await fetch(`/api/interviews/mock/${sessionId}/status`, { cache: "no-store" }), "读取生成进度失败。"),
    retry: async () => {
      await readJson(await fetch(`/api/interviews/mock/${sessionId}/retry-generation`, { method: "POST" }), "重试生成失败。");
    },
    accept: async () => {
      await readJson(await fetch(`/api/interviews/mock/${sessionId}/retry-generation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "accept" }) }), "开始失败。");
    },
  };
}

function phaseLabel(phase: string | null): string {
  if (phase === "brief") {
    return "面试官正在备课";
  }
  return "正在分析岗位能力";
}

/** 备课进度卡：轮询状态；失败时重新备课；备课没成但有兜底简报时（degraded）可以看过说明后就这样开始。 */
export function MockInterviewGenerationProgress({
  sessionId,
  initial,
  driver: injectedDriver,
  onReady,
}: {
  sessionId: string;
  initial: GenerationState;
  driver?: GenerationProgressDriver;
  /** 备课完成后的刷新方式；缺省重取服务端视图。 */
  onReady?: () => void;
}) {
  const router = useRouter();
  const driver = useMemo(() => injectedDriver ?? createLocalGenerationDriver(sessionId), [injectedDriver, sessionId]);
  const [state, setState] = useState(initial);
  const [retrying, setRetrying] = useState(false);

  const refreshStatus = useCallback(async () => {
    const next = await driver.poll();
    setState(next);
    if (next.status !== "generating") {
      if (onReady) onReady();
      else router.refresh();
    }
  }, [driver, onReady, router]);

  useEffect(() => {
    if (state.status !== "generating") return;
    const interval = window.setInterval(() => {
      void refreshStatus().catch(() => {});
    }, 2_500);
    return () => window.clearInterval(interval);
  }, [refreshStatus, state.status]);

  const retry = async () => {
    setRetrying(true);
    try {
      setState({ status: "generating", generationPhase: state.generationPhase ?? "job_blueprint", error: null });
      await driver.retry();
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "generation_failed",
        error: error instanceof Error ? error.message : "重试生成失败。",
      }));
    } finally {
      setRetrying(false);
    }
  };

  const degraded = state.status === "generation_failed" && state.errorCode === "degraded" && Boolean(driver.accept);
  const accept = async () => {
    setRetrying(true);
    try {
      await driver.accept?.();
      if (onReady) onReady();
      else router.refresh();
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "开始失败。" }));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Card className="p-6">
      {state.status === "generation_failed" ? (
        <div className="grid gap-4">
          <Alert tone={degraded ? "warning" : "danger"}>
            <div>
              <p className="font-semibold">{state.error ?? "面试准备没有完成。"}</p>
              <p className="mt-1">{degraded ? "按通用要求出题的面试，报告里没有按岗位能力的估计。" : "可以直接重试，不需要重新提交内容。"}</p>
            </div>
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button disabled={retrying} onClick={retry} type="button">
              {retrying ? "正在重新备课…" : "重新备课"}
            </Button>
            {degraded ? (
              <Button disabled={retrying} onClick={accept} type="button" variant="outline">
                就这样开始
              </Button>
            ) : null}
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
