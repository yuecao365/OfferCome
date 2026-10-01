"use client";

import { AlertTriangle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input, Textarea } from "@/components/ui/form-controls";
import {
  PROFILE_DIMENSION_LABELS_I18N,
  PROFILE_INSIGHT_KIND_LABELS_I18N,
  PROFILE_SOURCE_LABELS_I18N,
  type ProfileDimension,
  type ProfileInsightKind,
  type ProfileSourceType,
} from "@/lib/candidate-profile/types";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

import {
  EvidencePolarityBadge,
  evidencePolarityContainerClass,
} from "./evidence-polarity";
import { evidenceConfidenceLabel, profileLevelLabel } from "./profile-labels";

const messages = defineMessages({
  "zh-CN": {
    updateFailed: "更新画像失败。",
    locked: "已保护",
    conflict: "有相反的证据，点开看",
    summaryTitle: "等级按各场评分加权；趋势看最近几场相对更早几场；证据量看场次数、真实面试占比与新鲜度",
    trend: { up: "在上升", down: "在下降", stable: "稳定", other: "场次还少看不出趋势" },
    summary: (level: string, trend: string, confidence: string) => `当前${level}，最近${trend}，证据${confidence}`,
    title: "标题",
    statement: "洞察内容",
    viewEvidence: (n: number) => `查看证据（${n}）`,
    saveAndLock: "保存并保护",
    cancel: "取消",
    restore: "恢复并确认",
    confirm: "确认并保护",
    edit: "编辑",
    hide: "隐藏",
  },
  en: {
    updateFailed: "Couldn't update the profile.",
    locked: "Protected",
    conflict: "Has contradicting evidence — open to see",
    summaryTitle: "Level is weighted by per-interview scores; trend compares recent interviews with earlier ones; evidence reflects interview count, share of real interviews and recency",
    trend: { up: "trending up", down: "trending down", stable: "steady", other: "too few interviews to show a trend" },
    summary: (level: string, trend: string, confidence: string) => `Level: ${level} · ${trend} · evidence ${confidence}`,
    title: "Title",
    statement: "Insight",
    viewEvidence: (n: number) => `View evidence (${n})`,
    saveAndLock: "Save and protect",
    cancel: "Cancel",
    restore: "Restore and confirm",
    confirm: "Confirm and protect",
    edit: "Edit",
    hide: "Hide",
  },
});

export type CandidateInsightCardValue = {
  id: string;
  dimension: ProfileDimension;
  kind: ProfileInsightKind;
  title: string;
  statement: string;
  confidence: number;
  level: number | null;
  levelLabel: string;
  trend: string;
  confidenceLabel: string;
  status: string;
  isUserLocked: boolean;
  hasConflict: boolean;
  evidence: Array<{
    id: string;
    polarity: string;
    excerpt: string;
    sourceKind: ProfileSourceType;
    companyName: string;
    jobTitle: string;
    question: string;
  }>;
};

export type InsightUpdateAction = (
  id: string,
  body: { action: "confirm" | "edit" | "hide" | "restore"; title: string; statement: string },
) => Promise<void>;

async function defaultUpdateAction(
  id: string,
  body: { action: string; title: string; statement: string },
  fallback: string,
): Promise<void> {
  const response = await fetch(`/api/candidate-profile/insights/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? fallback);
}

export function CandidateInsightCard({
  insight,
  updateAction,
}: {
  insight: CandidateInsightCardValue;
  /** 覆盖默认的本地版 API（体验版传浏览器实现）。 */
  updateAction?: InsightUpdateAction;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useMessages(messages);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(insight.title);
  const [statement, setStatement] = useState(insight.statement);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const update = async (action: "confirm" | "edit" | "hide" | "restore") => {
    setPending(true);
    setError("");
    try {
      const body = { action, title, statement };
      if (updateAction) await updateAction(insight.id, body);
      else await defaultUpdateAction(insight.id, body, t.updateFailed);
      setEditing(false);
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t.updateFailed);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{PROFILE_INSIGHT_KIND_LABELS_I18N[locale][insight.kind]}</Badge>
          <Badge>{PROFILE_DIMENSION_LABELS_I18N[locale][insight.dimension]}</Badge>
          {insight.isUserLocked ? <Badge tone="success"><LockKeyhole aria-hidden="true" className="size-3" />{t.locked}</Badge> : null}
          {insight.hasConflict ? <Badge tone="warning"><AlertTriangle aria-hidden="true" className="size-3" />{t.conflict}</Badge> : null}
        </div>
        <span className="text-xs text-muted-foreground" title={t.summaryTitle}>
          {t.summary(
            profileLevelLabel(insight.levelLabel, locale),
            insight.trend === "up" ? t.trend.up : insight.trend === "down" ? t.trend.down : insight.trend === "stable" ? t.trend.stable : t.trend.other,
            evidenceConfidenceLabel(insight.confidenceLabel, locale),
          )}
        </span>
      </div>

      {editing ? (
        <div className="mt-4 grid gap-3">
          <FieldLabel>{t.title}<Input onChange={(event) => setTitle(event.target.value)} value={title} /></FieldLabel>
          <FieldLabel>{t.statement}<Textarea onChange={(event) => setStatement(event.target.value)} value={statement} /></FieldLabel>
        </div>
      ) : (
        <>
          <h3 className="mt-4 text-sm font-semibold text-foreground">{insight.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{insight.statement}</p>
        </>
      )}

      {insight.evidence.length > 0 ? (
        <details className="mt-4 rounded-lg border border-border bg-surface-subtle p-3">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">{t.viewEvidence(insight.evidence.length)}</summary>
          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
            {insight.evidence.map((evidence) => (
              <div
                className={`rounded-lg border bg-surface p-3 ${evidencePolarityContainerClass(evidence.polarity)}`}
                key={evidence.id}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{PROFILE_SOURCE_LABELS_I18N[locale][evidence.sourceKind]} · {evidence.companyName}</span>
                  <EvidencePolarityBadge polarity={evidence.polarity} />
                </div>
                <p className="mt-1 text-sm font-semibold text-foreground">{evidence.question}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{evidence.excerpt}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {error ? <Alert className="mt-3" tone="danger">{error}</Alert> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {editing ? (
          <>
            <Button disabled={pending} onClick={() => update("edit")} size="sm">{t.saveAndLock}</Button>
            <Button disabled={pending} onClick={() => setEditing(false)} size="sm" variant="ghost">{t.cancel}</Button>
          </>
        ) : insight.status === "hidden" ? (
          <Button disabled={pending} onClick={() => update("restore")} size="sm" variant="outline">{t.restore}</Button>
        ) : (
          <>
            {insight.status !== "active" || !insight.isUserLocked ? (
              <Button disabled={pending} onClick={() => update("confirm")} size="sm">{t.confirm}</Button>
            ) : null}
            <Button disabled={pending} onClick={() => setEditing(true)} size="sm" variant="outline">{t.edit}</Button>
            <Button disabled={pending} onClick={() => update("hide")} size="sm" variant="ghost">{t.hide}</Button>
          </>
        )}
      </div>
    </Card>
  );
}
