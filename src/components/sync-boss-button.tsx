"use client";

import { ArrowRight, Check, LogIn, RefreshCw, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { Modal } from "@/components/modal";
import { updateApplicationStage } from "@/lib/applications/actions";
import { suggestedStageForSourceChange } from "@/lib/applications/stage-advance";
import {
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABELS_I18N,
  type ApplicationStage,
} from "@/lib/applications/types";
import type {
  BossLoginResult,
  BossSyncChangedField,
  BossSyncHighlight,
  BossSyncPublicResult,
} from "@/lib/boss/contracts";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

type SyncPhase = "idle" | "syncing" | "login" | "success" | "failed";

const messages = defineMessages<{
  changedFields: Record<BossSyncChangedField, string>;
  listSeparator: string;
  newApplication: string;
  autoRejected: string;
  jobClosed: string;
  updateStage: string;
  updateStagePlaceholder: string;
  saved: string;
  saveFailed: string;
  sectionTitle: (title: string, count: number) => string;
  metrics: { checked: string; created: string; changed: string; autoRejected: string };
  resultTitle: string;
  responseTimeout: string;
  pageLimit: string;
  needsAttention: string;
  needsAttentionHint: string;
  changedSection: string;
  nothingToHandle: string;
  newSection: string;
  done: string;
  failedTitle: string;
  waitingTitle: string;
  retry: string;
  dismiss: string;
  syncing: string;
  loginRequired: string;
  loginDone: string;
  syncFailed: string;
  waitingLogin: string;
  syncingShort: string;
  sync: string;
}>({
  "zh-CN": {
    changedFields: {
      activity: "有新活动",
      company_name: "公司名称变化",
      job_title: "岗位名称变化",
      source_status: "Boss 岗位状态变化",
    },
    listSeparator: "、",
    newApplication: "新投递",
    autoRejected: "投递满 30 天且未检测到后续活动，已自动标记拒绝",
    jobClosed: "岗位已下架",
    updateStage: "更新投递状态",
    updateStagePlaceholder: "更新状态…",
    saved: "已保存",
    saveFailed: "保存失败",
    sectionTitle: (title, count) => `${title}（${count}）`,
    metrics: { checked: "检查岗位", created: "新增投递", changed: "来源变化", autoRejected: "自动拒绝" },
    resultTitle: "Boss 同步完成",
    responseTimeout: "同步中途等待 Boss 响应超时，仅同步了部分页面，可稍后重新同步补齐。",
    pageLimit: "本次同步达到安全页数上限，可能仍有更早的岗位未检查。",
    needsAttention: "需要关注",
    needsAttentionHint: "同步不会自动推进面试或 Offer 状态。可在下方直接选择实际进度。",
    changedSection: "状态或来源发生变化",
    nothingToHandle: "没有需要手动处理的状态变化。",
    newSection: "查看本次新增投递",
    done: "完成",
    failedTitle: "Boss 同步未完成",
    waitingTitle: "正在等待 Boss",
    retry: "重新同步",
    dismiss: "关闭同步提示",
    syncing: "正在后台同步 Boss 投递记录...",
    loginRequired: "Boss 需要登录。已打开登录窗口，请完成登录，看到推荐岗位页面后关闭整个浏览器窗口，同步会自动继续。",
    loginDone: "登录完成，正在后台同步 Boss 投递记录...",
    syncFailed: "Boss 同步失败，请稍后重试。",
    waitingLogin: "等待 Boss 登录...",
    syncingShort: "同步中...",
    sync: "同步 Boss 新投递岗位",
  },
  en: {
    changedFields: {
      activity: "New activity",
      company_name: "Company name changed",
      job_title: "Job title changed",
      source_status: "Boss job status changed",
    },
    listSeparator: ", ",
    newApplication: "New application",
    autoRejected: "No follow-up activity 30 days after applying; marked as rejected",
    jobClosed: "Job taken down",
    updateStage: "Update application stage",
    updateStagePlaceholder: "Update stage…",
    saved: "Saved",
    saveFailed: "Save failed",
    sectionTitle: (title, count) => `${title} (${count})`,
    metrics: { checked: "Jobs checked", created: "New applications", changed: "Source changes", autoRejected: "Auto-rejected" },
    resultTitle: "Boss sync complete",
    responseTimeout: "Boss stopped responding midway, so only some pages were synced. Sync again later to fill in the rest.",
    pageLimit: "This sync hit the safety page limit; some older jobs may not have been checked.",
    needsAttention: "Needs attention",
    needsAttentionHint: "Syncing never advances interview or offer stages on its own. Pick the actual stage below.",
    changedSection: "Status or source changed",
    nothingToHandle: "No stage changes need your attention.",
    newSection: "New applications from this sync",
    done: "Done",
    failedTitle: "Boss sync didn't finish",
    waitingTitle: "Waiting for Boss",
    retry: "Sync again",
    dismiss: "Dismiss sync notice",
    syncing: "Syncing Boss applications in the background...",
    loginRequired: "Boss needs you to sign in. A sign-in window is open: sign in, and once you see the recommended jobs page, close the whole browser window. Syncing will continue automatically.",
    loginDone: "Signed in. Syncing Boss applications in the background...",
    syncFailed: "Boss sync failed. Please try again later.",
    waitingLogin: "Waiting for Boss sign-in...",
    syncingShort: "Syncing...",
    sync: "Sync new Boss applications",
  },
});

type SyncMessages = (typeof messages)["zh-CN"];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const result = (await response.json()) as T;
  return result;
}

function highlightLabel(highlight: BossSyncHighlight, t: SyncMessages): string {
  if (highlight.kind === "new") {
    return t.newApplication;
  }
  if (highlight.kind === "auto_rejected") {
    return t.autoRejected;
  }

  return highlight.changedFields
    .map((field) =>
      // 状态码变化在实际数据里几乎只有"下架"一种，能确定时就直说。
      field === "source_status" && highlight.sourceJobClosed
        ? t.jobClosed
        : t.changedFields[field],
    )
    .join(t.listSeparator);
}

/**
 * 建议规则本身在 suggestedStageForSourceChange 里，这里只负责把一条高亮
 * 翻译成它认识的两个信号。两者都要求「本次同步真的变了」——已经下架很久的
 * 岗位不该在一条改名提醒旁边冒出「拒绝」按钮。
 */
function suggestionFor(highlight: BossSyncHighlight): ApplicationStage | null {
  const sourceChanged = highlight.kind === "source_changed";
  return suggestedStageForSourceChange({
    currentStage: highlight.currentStage,
    hasNewActivity:
      sourceChanged && highlight.changedFields.includes("activity"),
    hasJobClosed:
      sourceChanged &&
      highlight.changedFields.includes("source_status") &&
      highlight.sourceJobClosed,
  });
}

/**
 * 让用户在同步结果里就地把有新互动的岗位改成一面、Offer 等状态。
 *
 * 建议不预填进下拉框，而是单独给一个按钮：下拉框是 onChange 即保存的，
 * 预填进去反而会让"认可这个建议"变得无法提交（选中同一个值不触发 change）。
 */
function StagePicker({
  sourceKey,
  suggestion,
}: {
  sourceKey: string;
  suggestion: ApplicationStage | null;
}) {
  const [stage, setStage] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const t = useMessages(messages);
  const stageLabels = APPLICATION_STAGE_LABELS_I18N[useLocale()];

  async function save(nextStage: string) {
    setStage(nextStage);
    if (!nextStage) return;

    setState("saving");
    const result = await updateApplicationStage(sourceKey, nextStage);
    setState(result.ok ? "saved" : "error");
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {suggestion && state === "idle" ? (
        <Button
          onClick={() => void save(suggestion)}
          size="sm"
          variant="outline"
        >
          <ArrowRight aria-hidden="true" className="size-3.5" />
          {stageLabels[suggestion]}
        </Button>
      ) : null}
      <Select
        aria-label={t.updateStage}
        className="h-8 w-32 px-2 text-xs"
        disabled={state === "saving"}
        onChange={(event) => void save(event.target.value)}
        value={stage}
      >
        <option value="">{t.updateStagePlaceholder}</option>
        {APPLICATION_STAGES.map((option) => (
          <option key={option} value={option}>
            {stageLabels[option]}
          </option>
        ))}
      </Select>
      {state === "saved" ? (
        <Check aria-label={t.saved} className="size-4 text-success" />
      ) : null}
      {state === "error" ? (
        <span className="text-xs text-danger">{t.saveFailed}</span>
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
  const t = useMessages(messages);
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
            {highlightLabel(highlight, t)}
          </Badge>
          <span className="min-w-0 break-words text-sm text-foreground">
            {highlight.companyName} · {highlight.jobTitle}
          </span>
          {withStagePicker ? (
            <StagePicker
              sourceKey={highlight.sourceKey}
              suggestion={suggestionFor(highlight)}
            />
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
  const t = useMessages(messages);
  if (highlights.length === 0) {
    return null;
  }

  return (
    <details
      className="overflow-hidden rounded-lg border border-border bg-surface"
      open={defaultOpen || undefined}
    >
      <summary className="cursor-pointer select-none bg-surface-subtle px-4 py-3 text-sm font-semibold text-foreground">
        {t.sectionTitle(title, highlights.length)}
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
  const t = useMessages(messages);
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
    { label: t.metrics.checked, value: result.totalCount ?? 0 },
    { label: t.metrics.created, value: result.createdCount ?? 0 },
    { label: t.metrics.changed, value: changedApplications.length },
    { label: t.metrics.autoRejected, value: result.autoRejectedCount ?? 0 },
  ];

  return (
    <Modal
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      size="wide"
      title={t.resultTitle}
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
                ? t.responseTimeout
                : t.pageLimit}
            </Alert>
          ) : null}

          {needsAttention.length > 0 ? (
            <section className="grid gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t.needsAttention}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.needsAttentionHint}
                </p>
              </div>
              <ResultSection
                defaultOpen
                highlights={needsAttention}
                title={t.changedSection}
                withStagePicker
              />
            </section>
          ) : (
            <Alert tone="success">{t.nothingToHandle}</Alert>
          )}

          <ResultSection
            highlights={newApplications}
            title={t.newSection}
          />

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={close}>{t.done}</Button>
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
  const t = useMessages(messages);
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
              {phase === "failed" ? t.failedTitle : t.waitingTitle}
            </p>
            <p className="mt-0.5 text-xs leading-5 opacity-90">{message}</p>
          </div>
          {phase === "failed" ? (
            <Button onClick={onRetry} size="sm" variant="outline">
              <RotateCcw aria-hidden="true" className="size-3.5" />
              {t.retry}
            </Button>
          ) : null}
        </div>
        <button
          aria-label={t.dismiss}
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
  const t = useMessages(messages);
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
    setMessage(t.syncing);
    setSyncResult(null);

    try {
      let result = await requestJson<BossSyncPublicResult>("/api/boss/sync");

      if (result.status === "login_required") {
        setPhase("login");
        setMessage(t.loginRequired);

        const loginResult =
          await requestJson<BossLoginResult>("/api/boss/login");
        if (!loginResult.success) {
          setPhase("failed");
          setMessage(loginResult.message);
          return;
        }

        setPhase("syncing");
        setMessage(t.loginDone);
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
      setMessage(t.syncFailed);
    }
  }

  const isBusy = phase === "syncing" || phase === "login";
  const buttonLabel =
    phase === "login"
      ? t.waitingLogin
      : phase === "syncing"
        ? t.syncingShort
        : t.sync;

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
