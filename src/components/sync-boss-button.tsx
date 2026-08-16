"use client";

import { Check, LogIn, RefreshCw, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { Modal } from "@/components/modal";
import { updateApplicationStage } from "@/lib/applications/actions";
import {
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABELS,
} from "@/lib/applications/types";
import type {
  BossLoginResult,
  BossSyncChangedField,
  BossSyncHighlight,
  BossSyncPublicResult,
} from "@/lib/boss/contracts";

type SyncPhase = "idle" | "syncing" | "login" | "success" | "failed";

const CHANGED_FIELD_LABELS: Record<BossSyncChangedField, string> = {
  activity: "有新活动",
  company_name: "公司名称变化",
  job_title: "岗位名称变化",
  source_status: "Boss 岗位状态变化",
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const result = (await response.json()) as T;
  return result;
}

function highlightLabel(highlight: BossSyncHighlight): string {
  if (highlight.kind === "new") {
    return "新投递";
  }
  if (highlight.kind === "auto_rejected") {
    return "投递满 30 天且未检测到后续活动，已自动标记拒绝";
  }

  return highlight.changedFields.map((field) => CHANGED_FIELD_LABELS[field]).join("、");
}

/** 让用户在同步结果里就地把有新互动的岗位改成一面、Offer 等状态。 */
function StagePicker({ sourceKey }: { sourceKey: string }) {
  const [stage, setStage] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function handleChange(nextStage: string) {
    setStage(nextStage);
    if (!nextStage) return;

    setState("saving");
    const result = await updateApplicationStage(sourceKey, nextStage);
    setState(result.ok ? "saved" : "error");
  }

  return (
    <span className="flex items-center gap-2">
      <Select
        aria-label="更新投递状态"
        className="h-8 w-32 px-2 text-xs"
        disabled={state === "saving"}
        onChange={(event) => void handleChange(event.target.value)}
        value={stage}
      >
        <option value="">更新状态…</option>
        {APPLICATION_STAGES.map((option) => (
          <option key={option} value={option}>
            {APPLICATION_STAGE_LABELS[option]}
          </option>
        ))}
      </Select>
      {state === "saved" ? (
        <Check aria-label="已保存" className="size-4 text-success" />
      ) : null}
      {state === "error" ? (
        <span className="text-xs text-danger">保存失败</span>
      ) : null}
    </span>
  );
}

function HighlightList({
  highlights,
  withStagePicker = false,
}: {
  highlights: BossSyncHighlight[];
  withStagePicker?: boolean;
}) {
  if (highlights.length === 0) {
    return null;
  }

  return (
    <ul className="divide-y divide-border">
      {highlights.map((highlight, index) => (
        <li
          className="grid gap-1.5 px-1 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
          key={`${highlight.kind}-${highlight.sourceKey}-${index}`}
        >
          <Badge tone={highlight.kind === "auto_rejected" ? "danger" : "brand"}>
            {highlightLabel(highlight)}
          </Badge>
          <span className="min-w-0 break-words text-sm text-foreground">
            {highlight.companyName} · {highlight.jobTitle}
          </span>
          {withStagePicker ? (
            <StagePicker sourceKey={highlight.sourceKey} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ResultSection({
  defaultOpen,
  highlights,
  title,
  withStagePicker,
}: {
  defaultOpen?: boolean;
  highlights: BossSyncHighlight[];
  title: string;
  withStagePicker?: boolean;
}) {
  if (highlights.length === 0) {
    return null;
  }

  return (
    <details
      className="overflow-hidden rounded-lg border border-border bg-surface"
      open={defaultOpen || undefined}
    >
      <summary className="cursor-pointer select-none bg-surface-subtle px-4 py-3 text-sm font-semibold text-foreground">
        {title}（{highlights.length}）
      </summary>
      <div className="max-h-80 overflow-y-auto px-3">
        <HighlightList
          highlights={highlights}
          withStagePicker={withStagePicker}
        />
      </div>
    </details>
  );
}

function SyncResultModal({
  onClose,
  result,
}: {
  onClose: () => void;
  result: BossSyncPublicResult;
}) {
  const highlights = result.highlights ?? [];
  const newApplications = highlights.filter((item) => item.kind === "new");
  const changedApplications = highlights.filter(
    (item) => item.kind === "source_changed",
  );
  const autoRejectedApplications = highlights.filter(
    (item) => item.kind === "auto_rejected",
  );
  const needsAttention = [
    ...changedApplications,
    ...autoRejectedApplications,
  ];
  const metrics = [
    { label: "检查岗位", value: result.totalCount ?? 0 },
    { label: "新增投递", value: result.createdCount ?? 0 },
    { label: "来源变化", value: changedApplications.length },
    { label: "自动拒绝", value: result.autoRejectedCount ?? 0 },
  ];

  return (
    <Modal
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      size="wide"
      title="Boss 同步完成"
    >
      {(close) => (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((metric) => (
              <div
                className="rounded-lg border border-border bg-surface-subtle px-4 py-3"
                key={metric.label}
              >
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>

          {result.completedAllPages === false ? (
            <Alert tone="info">
              {result.stopReason === "response-timeout"
                ? "同步中途等待 Boss 响应超时，仅同步了部分页面，可稍后重新同步补齐。"
                : "本次同步达到安全页数上限，可能仍有更早的岗位未检查。"}
            </Alert>
          ) : null}

          {needsAttention.length > 0 ? (
            <section className="grid gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  需要关注
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  同步不会自动推进面试或 Offer 状态。可在下方直接选择实际进度。
                </p>
              </div>
              <ResultSection
                defaultOpen
                highlights={needsAttention}
                title="状态或来源发生变化"
                withStagePicker
              />
            </section>
          ) : (
            <Alert tone="success">没有需要手动处理的状态变化。</Alert>
          )}

          <ResultSection
            highlights={newApplications}
            title="查看本次新增投递"
          />

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={close}>完成</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SyncStatus({
  message,
  onDismiss,
  onRetry,
  phase,
}: {
  message: string;
  onDismiss: () => void;
  onRetry: () => void;
  phase: SyncPhase;
}) {
  if (!message || phase === "success") {
    return null;
  }

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] text-left shadow-lg">
      <Alert
        className="relative pr-10"
        tone={phase === "failed" ? "danger" : "info"}
      >
        <div className="grid gap-2.5">
          <div>
            <p className="font-semibold">
              {phase === "failed" ? "Boss 同步未完成" : "正在等待 Boss"}
            </p>
            <p className="mt-0.5 text-xs leading-5 opacity-90">{message}</p>
          </div>
          {phase === "failed" ? (
            <Button onClick={onRetry} size="sm" variant="outline">
              <RotateCcw aria-hidden="true" className="size-3.5" />
              重新同步
            </Button>
          ) : null}
        </div>
        <button
          aria-label="关闭同步提示"
          className="absolute right-2 top-2 rounded-md p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </Alert>
    </div>
  );
}

export function SyncBossButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [message, setMessage] = useState("");
  const [syncResult, setSyncResult] = useState<BossSyncPublicResult | null>(
    null,
  );

  async function handleClick() {
    if (phase === "syncing" || phase === "login") {
      return;
    }

    setPhase("syncing");
    setMessage("正在后台同步 Boss 投递记录...");
    setSyncResult(null);

    try {
      let result = await requestJson<BossSyncPublicResult>("/api/boss/sync");

      if (result.status === "login_required") {
        setPhase("login");
        setMessage(
          "Boss 需要登录。已打开登录窗口，请完成登录，看到推荐岗位页面后关闭整个浏览器窗口，同步会自动继续。",
        );

        const loginResult =
          await requestJson<BossLoginResult>("/api/boss/login");
        if (!loginResult.success) {
          setPhase("failed");
          setMessage(loginResult.message);
          return;
        }

        setPhase("syncing");
        setMessage("登录完成，正在后台同步 Boss 投递记录...");
        result = await requestJson<BossSyncPublicResult>("/api/boss/sync");
      }

      if (result.status !== "success") {
        setPhase("failed");
        setMessage(result.message);
        return;
      }

      setPhase("success");
      setMessage("");
      setSyncResult(result);
      router.refresh();
    } catch {
      setPhase("failed");
      setMessage("Boss 同步失败，请稍后重试。");
    }
  }

  const isBusy = phase === "syncing" || phase === "login";
  const buttonLabel =
    phase === "login"
      ? "等待 Boss 登录..."
      : phase === "syncing"
        ? "同步中..."
        : "同步 Boss 新投递岗位";

  return (
    <div className="relative flex items-center">
      <Button disabled={isBusy} onClick={handleClick} variant="secondary">
        {phase === "login" ? (
          <LogIn aria-hidden="true" className="size-4" />
        ) : (
          <RefreshCw
            aria-hidden="true"
            className={`size-4 ${phase === "syncing" ? "animate-spin" : ""}`}
          />
        )}
        {buttonLabel}
      </Button>
      <SyncStatus
        message={message}
        onDismiss={() => {
          setMessage("");
          if (phase === "failed") setPhase("idle");
        }}
        onRetry={handleClick}
        phase={phase}
      />
      {syncResult ? (
        <SyncResultModal
          onClose={() => setSyncResult(null)}
          result={syncResult}
        />
      ) : null}
    </div>
  );
}
