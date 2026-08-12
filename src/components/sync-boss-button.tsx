"use client";

import { LogIn, RefreshCw, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import type {
  BossLoginResult,
  BossSyncChangedField,
  BossSyncHighlight,
  BossSyncPublicResult,
} from "@/lib/boss/contracts";

type SyncPhase = "idle" | "login" | "syncing" | "success" | "failed";

const CHANGED_FIELD_LABELS: Record<BossSyncChangedField, string> = {
  activity: "有新活动",
  company_name: "公司名称变化",
  job_title: "岗位名称变化",
  source_status: "Boss 岗位状态变化",
};

async function postJson<T>(url: string): Promise<T> {
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

function HighlightList({ highlights }: { highlights: BossSyncHighlight[] }) {
  if (highlights.length === 0) {
    return null;
  }

  return (
    <ul className="divide-y divide-border">
      {highlights.map((highlight, index) => (
        <li
          className="grid gap-1.5 px-1 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-3"
          key={`${highlight.kind}-${highlight.companyName}-${highlight.jobTitle}-${index}`}
        >
          <Badge tone={highlight.kind === "auto_rejected" ? "danger" : "brand"}>
            {highlightLabel(highlight)}
          </Badge>
          <span className="min-w-0 break-words text-sm text-foreground">
            {highlight.companyName} · {highlight.jobTitle}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ResultSection({
  defaultOpen,
  highlights,
  title,
}: {
  defaultOpen?: boolean;
  highlights: BossSyncHighlight[];
  title: string;
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
        <HighlightList highlights={highlights} />
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
              本次同步达到安全页数上限，可能仍有更早的岗位未检查。
            </Alert>
          ) : null}

          {needsAttention.length > 0 ? (
            <section className="grid gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  需要关注
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  来源变化不会自动修改面试或 Offer 状态，请按实际进度编辑。
                </p>
              </div>
              <ResultSection
                defaultOpen
                highlights={needsAttention}
                title="状态或来源发生变化"
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

  async function requestSync(): Promise<BossSyncPublicResult> {
    return postJson<BossSyncPublicResult>("/api/boss/sync");
  }

  async function handleClick() {
    if (phase === "syncing" || phase === "login") {
      return;
    }

    setPhase("syncing");
    setMessage(
      "正在打开 Boss 同步窗口。若页面要求登录或安全验证，请手动完成并保持窗口打开，同步会自动继续。",
    );
    setSyncResult(null);

    try {
      let result = await requestSync();

      if (result.status === "login_required") {
        setPhase("login");
        setMessage("Boss 需要重新登录或安全校验，浏览器已打开。请按页面提示手动处理并关闭该窗口，随后会自动继续同步。");

        const loginResult = await postJson<BossLoginResult>("/api/boss/login");
        if (!loginResult.success) {
          setPhase("failed");
          setMessage(loginResult.message);
          return;
        }

        setPhase("syncing");
        setMessage("登录态已刷新，正在继续同步全部岗位...");
        result = await requestSync();
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
      setMessage("Boss 同步失败，请稍后重试。登录窗口若仍打开，请先关闭后再重试。");
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
