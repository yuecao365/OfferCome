"use client";

import { Activity, Clock3, ListTree, Network, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CandidateInsightCard } from "./candidate-insight-card";
import {
  EvidencePolarityBadge,
  evidencePolarityContainerClass,
} from "./evidence-polarity";
import { ProfileGraph, type ProfileGraphInsight } from "./profile-graph";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PROFILE_DIMENSIONS,
  PROFILE_DIMENSION_LABELS,
  PROFILE_INSIGHT_KIND_LABELS,
  PROFILE_INSIGHT_KINDS,
  PROFILE_SOURCE_LABELS,
  type ProfileDimension,
} from "@/lib/candidate-profile/types";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import {
  MiniHistoryChart,
  ProfileAbilityBars,
  ProfileTimelineChart,
} from "./profile-visualizations";

export type ProfileMetricValue = {
  roleKey: string;
  dimension: ProfileDimension;
  level: number | null;
  levelLabel: string;
  trend: string;
  evidenceConfidence: number;
  confidenceLabel: string;
  interviewCount: number;
  realInterviewCount: number;
  evidenceCount: number;
};

export type ProfileSnapshotValue = {
  id: string;
  revision: number;
  roleKey: string;
  createdAt: string;
  metrics: Array<{ dimension: ProfileDimension; level: number | null; levelLabel: string }>;
};

type DashboardProps = {
  insights: ProfileGraphInsight[];
  metrics: ProfileMetricValue[];
  snapshots: ProfileSnapshotValue[];
  roles: Array<{ key: string; displayName: string }>;
  profileStatus: {
    status: string;
    phase: string;
    revision: number;
    completedCount: number;
    totalCount: number;
    lastRefreshedAt: string | null;
    lastError: string | null;
    needsFullRebuild: boolean;
  };
};

const TREND_LABELS: Record<string, string> = {
  up: "上升",
  down: "下降",
  stable: "稳定",
  insufficient: "趋势待积累",
};

function profileUpdatedAtLabel(value: string | null): string {
  if (!value) return "已是最新";

  return `最近更新 ${new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))}`;
}

type ProfileView = "graph" | "insights" | "dimensions" | "timeline";

export function CandidateProfileDashboard({
  insights,
  metrics,
  snapshots,
  roles,
  profileStatus,
}: DashboardProps) {
  const router = useRouter();
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [view, setView] = useState<ProfileView>("graph");
  const [showFilters, setShowFilters] = useState(false);
  const [liveStatus, setLiveStatus] = useState(profileStatus);
  const [roleKey, setRoleKey] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [referenceNow] = useState(() => Date.now());
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      if (mobile.matches || reducedMotion) setView("insights");
    };
    apply();
    mobile.addEventListener("change", apply);
    return () => {
      mobile.removeEventListener("change", apply);
    };
  }, [reducedMotion]);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch("/api/candidate-profile/status", { cache: "no-store" });
        if (!response.ok || stopped) return;
        const status = (await response.json()) as typeof liveStatus & { pending: boolean };
        setLiveStatus((current) => ({ ...current, ...status }));
        if (status.revision > profileStatus.revision) router.refresh();
      } catch {
        // 这里只同步展示状态；持久化任务由服务端和恢复调度器负责。
      }
    };
    const interval = window.setInterval(
      check,
      liveStatus.status === "pending" || liveStatus.status === "running" ? 5_000 : 30_000,
    );
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [liveStatus.status, profileStatus.revision, router]);

  const filteredInsights = useMemo(() => {
    const cutoff = dateRange === "all" ? null : referenceNow - Number(dateRange) * 86_400_000;
    return insights
      .filter((insight) => insight.roleKey === roleKey && insight.status !== "hidden")
      .filter((insight) => kindFilter === "all" || insight.kind === kindFilter)
      .map((insight) => ({
        ...insight,
        evidence: insight.evidence.filter((evidence) => {
          const sourceMatches =
            sourceFilter === "all" ||
            (sourceFilter === "real" && evidence.sourceKind.startsWith("real_")) ||
            (sourceFilter === "mock" && evidence.sourceKind === "mock_text");
          const dateMatches =
            cutoff === null ||
            (evidence.interviewAt !== null && new Date(evidence.interviewAt).getTime() >= cutoff);
          return sourceMatches && dateMatches;
        }),
      }))
      .filter((insight) =>
        sourceFilter === "all" && dateRange === "all" ? true : insight.evidence.length > 0,
      );
  }, [dateRange, insights, kindFilter, referenceNow, roleKey, sourceFilter]);

  const selected = filteredInsights.find((insight) => insight.id === selectedId) ?? null;
  const currentMetrics = metrics.filter((metric) => metric.roleKey === roleKey);

  const selectInsight = useCallback((id: string | null) => setSelectedId(id), []);

  const correctEvidence = async (
    observationId: string,
    action: "exclude" | "restore" | "reassign_dimension",
    dimension?: ProfileDimension,
  ) => {
    const response = await fetch(`/api/candidate-profile/observations/${observationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, dimension }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setIsError(true);
      setMessage(payload.error ?? "纠正证据失败。");
      return;
    }
    setMessage("已保存，能力画像会自动更新。");
    router.refresh();
  };

  const mergeRole = async () => {
    if (roleKey === "all" || !mergeTarget) return;
    setMutating(true);
    setMessage("");
    const response = await fetch("/api/candidate-profile/roles/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceKey: roleKey, targetKey: mergeTarget }),
    });
    const payload = (await response.json()) as { error?: string };
    setMutating(false);
    if (!response.ok) {
      setIsError(true);
      setMessage(payload.error ?? "合并岗位视角失败。");
      return;
    }
    setRoleKey("all");
    setMergeTarget("");
    setMessage("岗位视角已合并，能力画像会自动更新。");
    router.refresh();
  };

  const retryRefresh = async () => {
    setMutating(true);
    setMessage("");
    const response = await fetch("/api/candidate-profile/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    const payload = (await response.json()) as { error?: string };
    setMutating(false);
    if (!response.ok) {
      setIsError(true);
      setMessage(payload.error ?? "重试画像刷新失败。");
      return;
    }
    setIsError(false);
    setLiveStatus((current) => ({ ...current, status: "pending" }));
    setMessage("已重新开始画像刷新，请保持页面打开。");
  };

  const isUpdating = liveStatus.status === "pending" || liveStatus.status === "running";
  const isEmptyProfile =
    insights.length === 0 && metrics.every((metric) => metric.interviewCount === 0);
  const statusLabel = isUpdating
    ? liveStatus.phase === "synthesis"
      ? "正在生成新洞察"
      : `正在分析第 ${liveStatus.completedCount}/${liveStatus.totalCount} 场面试`
    : liveStatus.status === "failed"
      ? "更新暂未完成"
      : profileStatus.needsFullRebuild
        ? "等待自动更新"
        : profileUpdatedAtLabel(liveStatus.lastRefreshedAt);
  const views: Array<{ id: ProfileView; label: string; icon: typeof Network }> = [
    { id: "graph", label: "图谱", icon: Network },
    { id: "insights", label: "文字洞察", icon: ListTree },
    { id: "dimensions", label: "八维能力", icon: Activity },
    { id: "timeline", label: "成长记录", icon: Clock3 },
  ];

  return (
    <div className="relative">
      <ProfileGraph
        insights={filteredInsights}
        onSelect={selectInsight}
        reducedMotion={reducedMotion}
        selectedId={selectedId}
      />

      <div className="absolute left-4 right-24 top-4 z-30 flex max-w-max flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface/90 p-1.5 text-foreground shadow-xl backdrop-blur-xl">
        <span className="hidden items-center gap-2 border-r border-border px-2.5 py-1 text-xs font-semibold sm:inline-flex">
          <i className={`size-1.5 rounded-full ${isUpdating ? "animate-pulse bg-info" : liveStatus.status === "failed" ? "bg-danger" : "bg-success"}`} />
          能力图谱
          <span className="font-normal text-muted-foreground">{statusLabel}</span>
        </span>
        <nav aria-label="能力画像视图" className="flex gap-1">
          {views.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={view === item.id ? "page" : undefined}
                aria-label={item.label}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  view === item.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" className="size-3.5" />
                <span className="hidden lg:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button
          aria-expanded={showFilters}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
            showFilters ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          onClick={() => setShowFilters((open) => !open)}
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          <span className="hidden lg:inline">筛选</span>
        </button>
      </div>

      {showFilters ? (
        <section
          aria-label="画像筛选"
          className="absolute left-4 top-16 z-40 grid w-[min(760px,calc(100%-2rem))] gap-3 rounded-xl border border-border bg-surface/95 p-4 text-foreground shadow-2xl backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="col-span-full flex items-center justify-between">
            <strong className="text-sm">筛选与岗位视角</strong>
            <button aria-label="关闭筛选" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setShowFilters(false)} type="button">
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
          <label className="text-xs text-muted-foreground">画像视角
            <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setRoleKey(event.target.value)} value={roleKey}>
              <option value="all">全部画像</option>
              {roles.map((role) => <option key={role.key} value={role.key}>{role.displayName}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">日期范围
            <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setDateRange(event.target.value)} value={dateRange}>
              <option value="all">全部时间</option><option value="90">近 90 天</option><option value="180">近 180 天</option><option value="365">近一年</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">证据来源
            <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setSourceFilter(event.target.value)} value={sourceFilter}>
              <option value="all">真实 + 模拟</option><option value="real">仅真实面试</option><option value="mock">仅模拟面试</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">洞察类型
            <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setKindFilter(event.target.value)} value={kindFilter}>
              <option value="all">全部洞察</option>
              {PROFILE_INSIGHT_KINDS.map((kind) => <option key={kind} value={kind}>{PROFILE_INSIGHT_KIND_LABELS[kind]}</option>)}
            </select>
          </label>
          {roleKey !== "all" && roles.length > 1 ? (
            <div className="col-span-full flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <label className="min-w-56 flex-1 text-xs text-muted-foreground">将当前岗位合并到
                <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setMergeTarget(event.target.value)} value={mergeTarget}>
                  <option value="">选择目标岗位</option>
                  {roles.filter((role) => role.key !== roleKey).map((role) => <option key={role.key} value={role.key}>{role.displayName}</option>)}
                </select>
              </label>
              <Button disabled={!mergeTarget || mutating} onClick={mergeRole} size="sm">合并</Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {message || liveStatus.lastError || isUpdating ? (
        <div className="absolute bottom-16 right-4 z-40 w-[min(420px,calc(100%-2rem))]">
          <Alert tone={isError || liveStatus.lastError ? "danger" : "success"}>
            <span>
              {message || (isUpdating
                ? "刷新在页面打开时进行，保持页面打开可加速。"
                : `上次自动更新未完成：${liveStatus.lastError}。系统会自动重试。`)}
              {liveStatus.status === "failed" ? (
                <Button className="ml-3" disabled={mutating} onClick={retryRefresh} size="sm" variant="outline">
                  立即重试
                </Button>
              ) : null}
            </span>
          </Alert>
        </div>
      ) : null}

      {selected && view === "graph" ? (
        <div className="absolute bottom-16 right-4 top-16 z-30 w-[min(360px,calc(100%-2rem))]">
          <InsightDetail
            insight={selected}
            metrics={currentMetrics}
            onClose={() => setSelectedId(null)}
            onCorrect={correctEvidence}
            snapshots={snapshots.filter((item) => item.roleKey === roleKey)}
          />
        </div>
      ) : null}

      {view !== "graph" ? (
        <section className="absolute bottom-16 right-4 top-16 z-30 w-[min(780px,calc(100%-2rem))] overflow-y-auto rounded-xl border border-border bg-surface/95 p-5 text-foreground shadow-2xl backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">能力图谱分析</p>
              <h2 className="mt-1 text-xl font-semibold">{views.find((item) => item.id === view)?.label}</h2>
            </div>
            <button aria-label="返回图谱" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setView("graph")} type="button">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          {view === "dimensions" ? (
            <ProfileAbilityBars
              metrics={currentMetrics}
              onSelect={(dimension) => {
                const insight = filteredInsights.find((item) => item.dimension === dimension);
                if (insight) {
                  setSelectedId(insight.id);
                  setView("graph");
                } else {
                  setIsError(false);
                  setMessage("该维度还没有洞察，先积累面试证据。");
                }
              }}
            />
          ) : view === "insights" && filteredInsights.length === 0 ? (
            <EmptyState description="至少积累两场有效面试后，系统才会输出确定优势或短板。" title="洞察仍在积累" />
          ) : view === "insights" ? (
            <div className="grid gap-5">
              {PROFILE_INSIGHT_KINDS.map((kind) => {
                const grouped = filteredInsights.filter((insight) => insight.kind === kind);
                if (grouped.length === 0) return null;
                return <section className="grid gap-3" key={kind}>
                  <h3 className="font-semibold">{PROFILE_INSIGHT_KIND_LABELS[kind]}</h3>
                  <div className="grid gap-3">{grouped.map((insight) => <CandidateInsightCard insight={insight} key={insight.id} />)}</div>
                </section>;
              })}
            </div>
          ) : (
            <ProfileTimelineChart
              key={roleKey}
              snapshots={snapshots.filter((item) => item.roleKey === roleKey)}
            />
          )}
        </section>
      ) : null}

      {isEmptyProfile && view === "graph" ? (
        <Card className="absolute left-1/2 top-1/2 z-20 w-[min(520px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">画像需要至少两场有效面试</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            完成训练或导入真实面试后，系统会逐步形成可解释的能力洞察。
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/interviews/mock">先做一场 AI 模拟面试</ButtonLink>
            <ButtonLink href="/interviews/history" variant="outline">导入真实面试记录</ButtonLink>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function InsightDetail({ insight, metrics, snapshots, onClose, onCorrect }: {
  insight: ProfileGraphInsight;
  metrics: ProfileMetricValue[];
  snapshots: ProfileSnapshotValue[];
  onClose: () => void;
  onCorrect: (id: string, action: "exclude" | "restore" | "reassign_dimension", dimension?: ProfileDimension) => Promise<void>;
}) {
  const metric = metrics.find((item) => item.dimension === insight.dimension);
  const history = snapshots.flatMap((snapshot) => {
    const item = snapshot.metrics.find((entry) => entry.dimension === insight.dimension);
    return item?.level === null || item?.level === undefined ? [] : [{ date: snapshot.createdAt, level: item.level }];
  }).reverse();
  return <aside className="h-full overflow-y-auto rounded-xl border border-border bg-surface/95 p-5 text-foreground shadow-2xl backdrop-blur-xl">
    <div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge tone="brand">{PROFILE_INSIGHT_KIND_LABELS[insight.kind]}</Badge><Badge>{PROFILE_DIMENSION_LABELS[insight.dimension]}</Badge></div><button aria-label="关闭洞察详情" className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted" onClick={onClose} type="button">×</button></div>
    <h2 className="mt-3 text-lg font-semibold">{insight.title}</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{insight.statement}</p>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted-foreground">当前等级</dt><dd className="font-semibold">{metric?.levelLabel ?? "待积累"}</dd></div>
      <div><dt className="text-muted-foreground">趋势</dt><dd className="font-semibold">{TREND_LABELS[metric?.trend ?? "insufficient"]}</dd></div>
      <div><dt className="text-muted-foreground">证据置信度</dt><dd className="font-semibold">{metric?.confidenceLabel ?? "待积累"}</dd></div>
      <div><dt className="text-muted-foreground">覆盖</dt><dd className="font-semibold">{metric?.interviewCount ?? 0} 场 / {metric?.evidenceCount ?? 0} 条</dd></div>
    </dl>
    {history.length > 1 ? <MiniHistoryChart points={history} /> : null}
    <div className="mt-5 grid gap-3">
      {insight.evidence.map((evidence) => <article
        className={`rounded-lg border p-3 ${evidencePolarityContainerClass(evidence.polarity)}`}
        key={evidence.id}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{evidence.companyName} · {PROFILE_SOURCE_LABELS[evidence.sourceKind]}</span>
          <EvidencePolarityBadge polarity={evidence.polarity} />
        </div>
        <h3 className="mt-1 text-sm font-semibold">{evidence.question}</h3>
        <p className="mt-2 text-sm leading-6">{evidence.excerpt}</p>
        {evidence.observationId ? <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => onCorrect(evidence.observationId!, evidence.observationStatus === "excluded" ? "restore" : "exclude")} size="sm" variant="ghost">
            {evidence.observationStatus === "excluded" ? "恢复证据" : "排除证据"}
          </Button>
          <select aria-label="改到其他能力维度" className="rounded border border-border px-2 text-xs" defaultValue="" onChange={(event) => {
            if (event.target.value) void onCorrect(evidence.observationId!, "reassign_dimension", event.target.value as ProfileDimension);
          }}>
            <option value="">改维度…</option>{PROFILE_DIMENSIONS.filter((item) => item !== insight.dimension).map((item) => <option key={item} value={item}>{PROFILE_DIMENSION_LABELS[item]}</option>)}
          </select>
        </div> : null}
      </article>)}
    </div>
  </aside>;
}
