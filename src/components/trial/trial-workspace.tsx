"use client";

import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { TrialInterviewRoom } from "@/components/trial/trial-interview-room";
import { TrialSetup } from "@/components/trial/trial-setup";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startInterview } from "@/lib/trial/client";
import {
  clearTrialData,
  getAiReadyServerSnapshot,
  getAiReadySnapshot,
  getInterviewSnapshot,
  getServerSnapshot,
  subscribeTrialStore,
  writeInterview,
} from "@/lib/trial/browser-store";
import type { TrialInterview, TrialJobInput, TrialResumeInput } from "@/lib/trial/interview";
import type { TrialPresetJob } from "@/lib/trial/preset-jobs";

/**
 * 体验版的顶层容器：准备阶段与面试房间之间切换，并把会话文档同步进
 * sessionStorage。服务端不保存任何东西，这里就是唯一的"真相来源"。
 */
export function TrialWorkspace({ presetJobs }: { presetJobs: TrialPresetJob[] }) {
  // sessionStorage 是 React 之外的存储，用 useSyncExternalStore 订阅：
  // 写入后由 store 通知重渲染，不需要在 effect 里同步 setState。
  const interview = useSyncExternalStore(
    subscribeTrialStore,
    getInterviewSnapshot,
    getServerSnapshot,
  );
  const aiReady = useSyncExternalStore(
    subscribeTrialStore,
    getAiReadySnapshot,
    getAiReadyServerSnapshot,
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  function persist(next: TrialInterview | null) {
    writeInterview(next);
  }

  async function handleStart(input: { job: TrialJobInput; resume: TrialResumeInput }) {
    setStarting(true);
    setError("");
    try {
      persist(await startInterview(input));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "创建面试失败。",
      );
    } finally {
      setStarting(false);
    }
  }

  function handleRestart() {
    clearTrialData();
    setError("");
  }

  if (interview) {
    return (
      <TrialInterviewRoom
        interview={interview}
        onChange={persist}
        onRestart={handleRestart}
      />
    );
  }

  return (
    <div className="grid gap-4">
      {starting ? (
        <Alert tone="info">
          <span className="flex items-center gap-2">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            正在分析岗位并出题，大约需要 30–60 秒，请不要关闭页面。
          </span>
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger">
          <div className="grid gap-2">
            <span>{error}</span>
            <span>
              <Button onClick={handleRestart} size="sm" variant="outline">
                <RotateCcw aria-hidden="true" className="size-3.5" />
                重置体验
              </Button>
            </span>
          </div>
        </Alert>
      ) : null}
      <TrialSetup
        aiReady={aiReady}
        busy={starting}
        onStart={handleStart}
        presetJobs={presetJobs}
      />
      <p className="text-xs text-muted-foreground">
        <Sparkles aria-hidden="true" className="mr-1 inline size-3" />
        全部数据只保存在当前浏览器标签页，关闭即清除；AI Key 随请求临时使用，服务器不存储。
      </p>
    </div>
  );
}
