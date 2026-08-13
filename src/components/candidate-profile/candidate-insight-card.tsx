"use client";

import { AlertTriangle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input, Textarea } from "@/components/ui/form-controls";
import {
  PROFILE_DIMENSION_LABELS,
  PROFILE_INSIGHT_KIND_LABELS,
  PROFILE_SOURCE_LABELS,
  type ProfileSourceType,
} from "@/lib/candidate-profile/types";

import {
  EvidencePolarityBadge,
  evidencePolarityContainerClass,
} from "./evidence-polarity";

export type CandidateInsightCardValue = {
  id: string;
  dimension: keyof typeof PROFILE_DIMENSION_LABELS;
  kind: keyof typeof PROFILE_INSIGHT_KIND_LABELS;
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

export function CandidateInsightCard({ insight }: { insight: CandidateInsightCardValue }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(insight.title);
  const [statement, setStatement] = useState(insight.statement);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const update = async (action: "confirm" | "edit" | "hide" | "restore") => {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/candidate-profile/insights/${insight.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, title, statement }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "更新画像失败。");
      setEditing(false);
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新画像失败。");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{PROFILE_INSIGHT_KIND_LABELS[insight.kind]}</Badge>
          <Badge>{PROFILE_DIMENSION_LABELS[insight.dimension]}</Badge>
          {insight.isUserLocked ? <Badge tone="success"><LockKeyhole aria-hidden="true" className="size-3" />已保护</Badge> : null}
          {insight.hasConflict ? <Badge tone="warning"><AlertTriangle aria-hidden="true" className="size-3" />存在反向证据</Badge> : null}
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {insight.levelLabel} · {insight.trend === "up" ? "上升" : insight.trend === "down" ? "下降" : insight.trend === "stable" ? "稳定" : "趋势待积累"} · 证据{insight.confidenceLabel}
        </span>
      </div>

      {editing ? (
        <div className="mt-4 grid gap-3">
          <FieldLabel>标题<Input onChange={(event) => setTitle(event.target.value)} value={title} /></FieldLabel>
          <FieldLabel>洞察内容<Textarea onChange={(event) => setStatement(event.target.value)} value={statement} /></FieldLabel>
        </div>
      ) : (
        <>
          <h3 className="mt-4 text-sm font-semibold text-foreground">{insight.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{insight.statement}</p>
        </>
      )}

      {insight.evidence.length > 0 ? (
        <details className="mt-4 rounded-lg border border-border bg-surface-subtle p-3">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">查看证据（{insight.evidence.length}）</summary>
          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
            {insight.evidence.map((evidence) => (
              <div
                className={`rounded-lg border bg-surface p-3 ${evidencePolarityContainerClass(evidence.polarity)}`}
                key={evidence.id}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{PROFILE_SOURCE_LABELS[evidence.sourceKind]} · {evidence.companyName}</span>
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
        {insight.kind === "weakness" || insight.kind === "training_focus" ? (
          <ButtonLink
            href={`/interviews/mock?seedInsightId=${encodeURIComponent(insight.id)}`}
            size="sm"
            variant="outline"
          >
            针对性训练
          </ButtonLink>
        ) : null}
        {editing ? (
          <>
            <Button disabled={pending} onClick={() => update("edit")} size="sm">保存并保护</Button>
            <Button disabled={pending} onClick={() => setEditing(false)} size="sm" variant="ghost">取消</Button>
          </>
        ) : insight.status === "hidden" ? (
          <Button disabled={pending} onClick={() => update("restore")} size="sm" variant="outline">恢复并确认</Button>
        ) : (
          <>
            {insight.status !== "active" || !insight.isUserLocked ? (
              <Button disabled={pending} onClick={() => update("confirm")} size="sm">确认并保护</Button>
            ) : null}
            <Button disabled={pending} onClick={() => setEditing(true)} size="sm" variant="outline">编辑</Button>
            <Button disabled={pending} onClick={() => update("hide")} size="sm" variant="ghost">隐藏</Button>
          </>
        )}
      </div>
    </Card>
  );
}
