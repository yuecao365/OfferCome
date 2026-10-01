"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    pollFailed: "读取生成进度失败。",
    retryFailed: "重试生成失败。",
    startFailed: "开始失败。",
    phaseBrief: "面试官正在备课",
    phaseBlueprint: "正在分析岗位能力",
    notFinished: "面试准备没有完成。",
    degradedHint: "按通用要求出题的面试，报告里没有按岗位能力的估计。",
    retryHint: "可以直接重试，不需要重新提交内容。",
    retrying: "正在重新备课…",
    retry: "重新备课",
    startAnyway: "就这样开始",
    backToSetup: "返回创建页",
    leaveHint: "可以离开或刷新页面，生成会在后台继续。",
  },
  en: {
    pollFailed: "Couldn't read prep progress.",
    retryFailed: "Couldn't retry prep.",
    startFailed: "Couldn't start.",
    phaseBrief: "The interviewer is preparing",
    phaseBlueprint: "Analyzing the role's required skills",
    notFinished: "Interview prep didn't finish.",
    degradedHint: "Questions will follow general expectations, and the report won't include role-specific skill estimates.",
    retryHint: "You can retry right away without resubmitting anything.",
    retrying: "Preparing again…",
    retry: "Prepare again",
    startAnyway: "Start anyway",
    backToSetup: "Back to setup",
    leaveHint: "You can leave or refresh the page; prep keeps running in the background.",
  },
});

type ProgressMessages = (typeof messages)["en"];

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

export function createLocalGenerationDriver(sessionId: string, t: ProgressMessages): GenerationProgressDriver {
  return {
    poll: async () =>
      readJson<GenerationState>(await fetch(`/api/interviews/mock/${sessionId}/status`, { cache: "no-store" }), t.pollFailed),
    retry: async () => {
      await readJson(await fetch(`/api/interviews/mock/${sessionId}/retry-generation`, { method: "POST" }), t.retryFailed);
    },
    accept: async () => {
      await readJson(await fetch(`/api/interviews/mock/${sessionId}/retry-generation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "accept" }) }), t.startFailed);
    },
  };
}

function phaseLabel(phase: string | null, t: ProgressMessages): string {
  return phase === "brief" ? t.phaseBrief : t.phaseBlueprint;
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
  const t = useMessages(messages);
  const driver = useMemo(() => injectedDriver ?? createLocalGenerationDriver(sessionId, t), [injectedDriver, sessionId, t]);
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
        error: error instanceof Error ? error.message : t.retryFailed,
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
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : t.startFailed }));
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
              <p className="font-semibold">{state.error ?? t.notFinished}</p>
              <p className="mt-1">{degraded ? t.degradedHint : t.retryHint}</p>
            </div>
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button disabled={retrying} onClick={retry} type="button">
              {retrying ? t.retrying : t.retry}
            </Button>
            {degraded ? (
              <Button disabled={retrying} onClick={accept} type="button" variant="outline">
                {t.startAnyway}
              </Button>
            ) : null}
            <Button
              disabled={retrying}
              onClick={() => router.push("/interviews/mock")}
              type="button"
              variant="outline"
            >
              {t.backToSetup}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-muted-foreground" strokeWidth={1.5} />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {phaseLabel(state.generationPhase, t)}
            </h3>
            <p className="mt-1 text-[0.8125rem] text-muted-foreground">
              {t.leaveHint}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
