"use client";

import { Activity, Clock3, ListTree, Network, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CandidateInsightCard, type InsightUpdateAction } from "./candidate-insight-card";
import {
  EvidencePolarityBadge,
  evidencePolarityContainerClass,
} from "./evidence-polarity";
import { ProfileGraph, type ProfileGraphInsight } from "./profile-graph";
import { evidenceConfidenceLabel, profileLabelMessages, profileLevelLabel } from "./profile-labels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatLongDateTime } from "@/lib/format/date";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages, type Locale } from "@/lib/i18n/locale";
import {
  PROFILE_DIMENSIONS,
  PROFILE_DIMENSION_LABELS_I18N,
  PROFILE_INSIGHT_KIND_LABELS_I18N,
  PROFILE_INSIGHT_KINDS,
  PROFILE_SOURCE_LABELS_I18N,
  type ProfileDimension,
} from "@/lib/candidate-profile/types";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import {
  MiniHistoryChart,
  ProfileAbilityBars,
  ProfileTimelineChart,
} from "./profile-visualizations";

const messages = defineMessages({
  "zh-CN": {
    refreshFailed: "重试画像刷新失败。",
    correctFailed: "纠正证据失败。",
    mergeFailed: "合并岗位视角失败。",
    correctSaved: "已保存，能力画像会自动更新。",
    mergeSaved: "岗位视角已合并，能力画像会自动更新。",
    refreshRestarted: "已重新开始画像刷新，请保持页面打开。",
    upToDate: "已是最新",
    updatedAt: (at: string) => `最近更新 ${at}`,
    synthesizing: "正在生成新洞察",
    analyzing: (done: number, total: number) => `正在分析第 ${done}/${total} 场面试`,
    failed: "更新暂未完成",
    awaitingUpdate: "等待自动更新",
    viewGraph: "图谱",
    viewInsights: "文字洞察",
    viewDimensions: "能力分组",
    viewTimeline: "成长记录",
    graphTitle: "能力图谱",
    viewsNav: "能力画像视图",
    filter: "筛选",
    filtersSection: "画像筛选",
    filtersTitle: "筛选与岗位视角",
    closeFilters: "关闭筛选",
    roleView: "画像视角",
    allProfiles: "全部画像",
    dateRange: "日期范围",
    allTime: "全部时间",
    last90: "近 90 天",
    last180: "近 180 天",
    lastYear: "近一年",
    source: "证据来源",
    sourceAll: "真实 + 模拟",
    sourceReal: "仅真实面试",
    sourceMock: "仅模拟面试",
    insightKind: "洞察类型",
    allInsights: "全部洞察",
    mergeInto: "将当前岗位合并到",
    chooseTarget: "选择目标岗位",
    merge: "合并",
    keepOpen: "刷新在页面打开时进行，保持页面打开可加速。",
    lastError: (error: string) => `上次自动更新未完成：${error}。系统会自动重试。`,
    retry: "立即重试",
    analysis: "能力图谱分析",
    backToGraph: "返回图谱",
    noDimensionInsight: "该维度还没有洞察，先积累面试证据。",
    insightsEmptyDescription: "完成一场面试或模拟面试后，这里会先出现标注「初步」的洞察，随场次增加逐步转正。",
    insightsEmptyTitle: "洞察仍在积累",
    emptyTitle: "画像从第一场面试就开始积累",
    emptyBody: "完成一场模拟面试或导入一场真实面试，这里就会出现初步的能力反馈。",
    startMock: "先做一场 AI 模拟面试",
    importReal: "导入真实面试记录",
    closeDetail: "关闭洞察详情",
    currentLevel: "当前等级",
    trend: "趋势",
    confidence: "证据置信度",
    coverage: "覆盖",
    coverageValue: (interviews: number, evidence: number) => `${interviews} 场 / ${evidence} 条`,
    restoreEvidence: "恢复证据",
    excludeEvidence: "排除证据",
    reassignAria: "改到其他能力维度",
    reassign: "改维度…",
  },
  en: {
    refreshFailed: "Couldn't restart the profile refresh.",
    correctFailed: "Couldn't correct the evidence.",
    mergeFailed: "Couldn't merge the role views.",
    correctSaved: "Saved. Your capability profile will update automatically.",
    mergeSaved: "Role views merged. Your capability profile will update automatically.",
    refreshRestarted: "Profile refresh restarted. Keep this page open.",
    upToDate: "Up to date",
    updatedAt: (at: string) => `Updated ${at}`,
    synthesizing: "Generating new insights",
    analyzing: (done: number, total: number) => `Analyzing interview ${done}/${total}`,
    failed: "Update not finished",
    awaitingUpdate: "Waiting for automatic update",
    viewGraph: "Graph",
    viewInsights: "Insights",
    viewDimensions: "Ability groups",
    viewTimeline: "Growth history",
    graphTitle: "Capability graph",
    viewsNav: "Capability profile views",
    filter: "Filter",
    filtersSection: "Profile filters",
    filtersTitle: "Filters and role view",
    closeFilters: "Close filters",
    roleView: "Profile view",
    allProfiles: "All profiles",
    dateRange: "Date range",
    allTime: "All time",
    last90: "Last 90 days",
    last180: "Last 180 days",
    lastYear: "Last year",
    source: "Evidence source",
    sourceAll: "Real + mock",
    sourceReal: "Real interviews only",
    sourceMock: "Mock interviews only",
    insightKind: "Insight type",
    allInsights: "All insights",
    mergeInto: "Merge this role into",
    chooseTarget: "Choose a target role",
    merge: "Merge",
    keepOpen: "Refreshing runs while the page is open — keep it open to speed things up.",
    lastError: (error: string) => `The last automatic update didn't finish: ${error}. It will retry automatically.`,
    retry: "Retry now",
    analysis: "Capability graph analysis",
    backToGraph: "Back to graph",
    noDimensionInsight: "No insights for this dimension yet — build up interview evidence first.",
    insightsEmptyDescription: "After an interview or mock interview, insights marked \"Preliminary\" appear here and firm up as you do more sessions.",
    insightsEmptyTitle: "Insights still building up",
    emptyTitle: "Your profile starts building from the first interview",
    emptyBody: "Finish a mock interview or import a real one, and preliminary capability feedback will appear here.",
    startMock: "Do an AI mock interview first",
    importReal: "Import a real interview",
    closeDetail: "Close insight details",
    currentLevel: "Current level",
    trend: "Trend",
    confidence: "Evidence confidence",
    coverage: "Coverage",
    coverageValue: (interviews: number, evidence: number) => `${interviews} interview${interviews === 1 ? "" : "s"} / ${evidence} item${evidence === 1 ? "" : "s"}`,
    restoreEvidence: "Restore evidence",
    excludeEvidence: "Exclude evidence",
    reassignAria: "Move to another capability dimension",
    reassign: "Change dimension…",
  },
});

type DashboardMessages = (typeof messages)["zh-CN"];

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

type ProfileStatusValue = DashboardProps["profileStatus"];

/**
 * 表盘的数据通道。默认实现走本地版 API + 数据库；
 * 体验版注入浏览器实现（无状态计算 API + 浏览器工作台）。
 */
export type CandidateProfileTransport = {
  fetchStatus(): Promise<Partial<ProfileStatusValue>>;
  /** 触发一轮画像刷新；失败时抛带用户可读信息的 Error。 */
  refresh(): Promise<void>;
  correctObservation(
    id: string,
    body: { action: "exclude" | "restore" | "reassign_dimension"; dimension?: ProfileDimension },
  ): Promise<void>;
  /** 省略时洞察卡走它自己的默认实现（本地版 API）。 */
  updateInsight?: InsightUpdateAction;
  /** 把一个岗位视角并入另一个。 */
  mergeRoles(sourceKey: string, targetKey: string): Promise<void>;
};

async function readJsonOrThrow(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const payload = (await response.json()) as { error?: string };
  throw new Error(payload.error ?? fallback);
}

function createDefaultTransport(t: DashboardMessages): CandidateProfileTransport {
  return {
    async fetchStatus() {
      const response = await fetch("/api/candidate-profile/status", { cache: "no-store" });
      if (!response.ok) throw new Error("status");
      return (await response.json()) as Partial<ProfileStatusValue>;
    },
    async refresh() {
      const response = await fetch("/api/candidate-profile/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      await readJsonOrThrow(response, t.refreshFailed);
    },
    async correctObservation(id, body) {
      const response = await fetch(`/api/candidate-profile/observations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await readJsonOrThrow(response, t.correctFailed);
    },
    async mergeRoles(sourceKey, targetKey) {
      const response = await fetch("/api/candidate-profile/roles/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceKey, targetKey }),
      });
      await readJsonOrThrow(response, t.mergeFailed);
    },
  };
}

type DashboardProps = {
  insights: ProfileGraphInsight[];
  metrics: ProfileMetricValue[];
  snapshots: ProfileSnapshotValue[];
  /** 冷启动时替代空表盘的"近期定性反馈"卡（服务端渲染后传入）。 */
  coldStartCard?: React.ReactNode;
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

function profileUpdatedAtLabel(value: string | null, t: DashboardMessages, locale: Locale): string {
  if (!value) return t.upToDate;

  return t.updatedAt(formatLongDateTime(value, "", locale));
}

type ProfileView = "graph" | "insights" | "dimensions" | "timeline";

export function CandidateProfileDashboard({
  insights,
  metrics,
  snapshots,
  coldStartCard,
  roles,
  profileStatus,
  transport: transportOverride,
}: DashboardProps & { transport?: CandidateProfileTransport }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useMessages(messages);
  const labels = useMessages(profileLabelMessages);
  const defaultTransport = useMemo(() => createDefaultTransport(t), [t]);
  const transport = transportOverride ?? defaultTransport;
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
        const status = await transport.fetchStatus();
        if (stopped) return;
        setLiveStatus((current) => ({ ...current, ...status }));
        if ((status.revision ?? 0) > profileStatus.revision) router.refresh();
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
  }, [liveStatus.status, profileStatus.revision, router, transport]);

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
    try {
      await transport.correctObservation(observationId, { action, dimension });
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : t.correctFailed);
      return;
    }
    setMessage(t.correctSaved);
    router.refresh();
  };

  const mergeRole = async () => {
    if (roleKey === "all" || !mergeTarget) return;
    setMutating(true);
    setMessage("");
    try {
      await transport.mergeRoles(roleKey, mergeTarget);
    } catch (caught) {
      setMutating(false);
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : t.mergeFailed);
      return;
    }
    setMutating(false);
    setRoleKey("all");
    setMergeTarget("");
    setMessage(t.mergeSaved);
    router.refresh();
  };

  const retryRefresh = async () => {
    setMutating(true);
    setMessage("");
    try {
      await transport.refresh();
    } catch (caught) {
      setMutating(false);
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : t.refreshFailed);
      return;
    }
    setMutating(false);
    setIsError(false);
    setLiveStatus((current) => ({ ...current, status: "pending" }));
    setMessage(t.refreshRestarted);
  };

  const isUpdating = liveStatus.status === "pending" || liveStatus.status === "running";
  const isEmptyProfile =
    insights.length === 0 && metrics.every((metric) => metric.interviewCount === 0);
  const statusLabel = isUpdating
    ? liveStatus.phase === "synthesis"
      ? t.synthesizing
      : t.analyzing(liveStatus.completedCount, liveStatus.totalCount)
    : liveStatus.status === "failed"
      ? t.failed
      : profileStatus.needsFullRebuild
        ? t.awaitingUpdate
        : profileUpdatedAtLabel(liveStatus.lastRefreshedAt, t, locale);
  const views: Array<{ id: ProfileView; label: string; icon: typeof Network }> = [
    { id: "graph", label: t.viewGraph, icon: Network },
    { id: "insights", label: t.viewInsights, icon: ListTree },
    { id: "dimensions", label: t.viewDimensions, icon: Activity },
    { id: "timeline", label: t.viewTimeline, icon: Clock3 },
  ];

  return (
    <div className="relative">
      <ProfileGraph
        insights={filteredInsights}
        onSelect={selectInsight}
        reducedMotion={reducedMotion}
        selectedId={selectedId}
      />

      <div className="absolute left-4 right-24 top-4 z-30 flex max-w-max flex-wrap items-center gap-1.5 rounded-panel border border-border bg-surface/90 p-1 text-foreground shadow-overlay backdrop-blur-xl">
        <span className="hidden items-center gap-2 border-r border-border px-2.5 py-1 text-xs font-semibold sm:inline-flex">
          <i className={`size-1.5 rounded-full ${isUpdating ? "animate-pulse bg-info" : liveStatus.status === "failed" ? "bg-danger" : "bg-success"}`} />
          {t.graphTitle}
          <span className="font-normal text-muted-foreground">{statusLabel}</span>
        </span>
        <nav aria-label={t.viewsNav} className="flex gap-1">
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
          <span className="hidden lg:inline">{t.filter}</span>
        </button>
      </div>

      {showFilters ? (
        <section
          aria-label={t.filtersSection}
          className="absolute left-4 top-16 z-40 grid w-[min(760px,calc(100%-2rem))] gap-3 rounded-panel border border-border bg-surface/95 p-4 text-foreground shadow-overlay backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="col-span-full flex items-center justify-between">
            <strong className="text-sm">{t.filtersTitle}</strong>
            <button aria-label={t.closeFilters} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setShowFilters(false)} type="button">
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
          <label className="text-xs text-muted-foreground">{t.roleView}
            <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setRoleKey(event.target.value)} value={roleKey}>
              <option value="all">{t.allProfiles}</option>
              {roles.map((role) => <option key={role.key} value={role.key}>{role.displayName}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">{t.dateRange}
            <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setDateRange(event.target.value)} value={dateRange}>
              <option value="all">{t.allTime}</option><option value="90">{t.last90}</option><option value="180">{t.last180}</option><option value="365">{t.lastYear}</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">{t.source}
            <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setSourceFilter(event.target.value)} value={sourceFilter}>
              <option value="all">{t.sourceAll}</option><option value="real">{t.sourceReal}</option><option value="mock">{t.sourceMock}</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">{t.insightKind}
            <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setKindFilter(event.target.value)} value={kindFilter}>
              <option value="all">{t.allInsights}</option>
              {PROFILE_INSIGHT_KINDS.map((kind) => <option key={kind} value={kind}>{PROFILE_INSIGHT_KIND_LABELS_I18N[locale][kind]}</option>)}
            </select>
          </label>
          {roleKey !== "all" && roles.length > 1 ? (
            <div className="col-span-full flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <label className="min-w-56 flex-1 text-xs text-muted-foreground">{t.mergeInto}
                <select className="mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground" onChange={(event) => setMergeTarget(event.target.value)} value={mergeTarget}>
                  <option value="">{t.chooseTarget}</option>
                  {roles.filter((role) => role.key !== roleKey).map((role) => <option key={role.key} value={role.key}>{role.displayName}</option>)}
                </select>
              </label>
              <Button disabled={!mergeTarget || mutating} onClick={mergeRole} size="sm">{t.merge}</Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {message || liveStatus.lastError || isUpdating ? (
        <div className="absolute bottom-16 right-4 z-40 w-[min(420px,calc(100%-2rem))]">
          <Alert tone={isError || liveStatus.lastError ? "danger" : "success"}>
            <span>
              {message || (isUpdating
                ? t.keepOpen
                : t.lastError(liveStatus.lastError ?? ""))}
              {liveStatus.status === "failed" ? (
                <Button className="ml-3" disabled={mutating} onClick={retryRefresh} size="sm" variant="outline">
                  {t.retry}
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
            labels={labels}
            locale={locale}
            metrics={currentMetrics}
            onClose={() => setSelectedId(null)}
            onCorrect={correctEvidence}
            snapshots={snapshots.filter((item) => item.roleKey === roleKey)}
            t={t}
          />
        </div>
      ) : null}

      {view !== "graph" ? (
        <section className="absolute bottom-16 right-4 top-16 z-30 w-[min(780px,calc(100%-2rem))] overflow-y-auto rounded-panel border border-border bg-surface/95 p-5 text-foreground shadow-overlay backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{t.analysis}</p>
              <h2 className="mt-1 text-xl font-semibold">{views.find((item) => item.id === view)?.label}</h2>
            </div>
            <button aria-label={t.backToGraph} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setView("graph")} type="button">
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
                  setMessage(t.noDimensionInsight);
                }
              }}
            />
          ) : view === "insights" && filteredInsights.length === 0 ? (
            <EmptyState description={t.insightsEmptyDescription} title={t.insightsEmptyTitle} />
          ) : view === "insights" ? (
            <div className="grid gap-5">
              {PROFILE_INSIGHT_KINDS.map((kind) => {
                const grouped = filteredInsights.filter((insight) => insight.kind === kind);
                if (grouped.length === 0) return null;
                return <section className="grid gap-3" key={kind}>
                  <h3 className="font-semibold">{PROFILE_INSIGHT_KIND_LABELS_I18N[locale][kind]}</h3>
                  <div className="grid gap-3">{grouped.map((insight) => <CandidateInsightCard insight={insight} key={insight.id} updateAction={transport.updateInsight} />)}</div>
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

      {/* 冷启动：有逐题反馈就先展示定性反馈卡，而不是空表盘提示。 */}
      {coldStartCard && view === "graph" && insights.length === 0 ? (
        <div className="absolute left-1/2 top-1/2 z-20 max-h-[calc(100%-8rem)] w-[min(640px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
          {coldStartCard}
        </div>
      ) : isEmptyProfile && view === "graph" ? (
        <Card className="absolute left-1/2 top-1/2 z-20 w-[min(520px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">{t.emptyTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t.emptyBody}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/interviews/mock">{t.startMock}</ButtonLink>
            <ButtonLink href="/interviews/history" variant="outline">{t.importReal}</ButtonLink>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function InsightDetail({ insight, metrics, snapshots, onClose, onCorrect, t, labels, locale }: {
  insight: ProfileGraphInsight;
  metrics: ProfileMetricValue[];
  snapshots: ProfileSnapshotValue[];
  onClose: () => void;
  onCorrect: (id: string, action: "exclude" | "restore" | "reassign_dimension", dimension?: ProfileDimension) => Promise<void>;
  t: DashboardMessages;
  labels: (typeof profileLabelMessages)["zh-CN"];
  locale: Locale;
}) {
  const metric = metrics.find((item) => item.dimension === insight.dimension);
  const history = snapshots.flatMap((snapshot) => {
    const item = snapshot.metrics.find((entry) => entry.dimension === insight.dimension);
    return item?.level === null || item?.level === undefined ? [] : [{ date: snapshot.createdAt, level: item.level }];
  }).reverse();
  return <aside className="h-full overflow-y-auto rounded-panel border border-border bg-surface/95 p-5 text-foreground shadow-overlay backdrop-blur-xl">
    <div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge tone="brand">{PROFILE_INSIGHT_KIND_LABELS_I18N[locale][insight.kind]}</Badge><Badge>{PROFILE_DIMENSION_LABELS_I18N[locale][insight.dimension]}</Badge></div><button aria-label={t.closeDetail} className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted" onClick={onClose} type="button">×</button></div>
    <h2 className="mt-3 text-lg font-semibold">{insight.title}</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{insight.statement}</p>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted-foreground">{t.currentLevel}</dt><dd className="font-semibold">{metric ? profileLevelLabel(metric.levelLabel, locale) : labels.pending}</dd></div>
      <div><dt className="text-muted-foreground">{t.trend}</dt><dd className="font-semibold">{labels.trend[metric?.trend ?? "insufficient"]}</dd></div>
      <div><dt className="text-muted-foreground">{t.confidence}</dt><dd className="font-semibold">{metric ? evidenceConfidenceLabel(metric.confidenceLabel, locale) : labels.pending}</dd></div>
      <div><dt className="text-muted-foreground">{t.coverage}</dt><dd className="font-semibold">{t.coverageValue(metric?.interviewCount ?? 0, metric?.evidenceCount ?? 0)}</dd></div>
    </dl>
    {history.length > 1 ? <MiniHistoryChart points={history} /> : null}
    <div className="mt-5 grid gap-3">
      {insight.evidence.map((evidence) => <article
        className={`rounded-lg border p-3 ${evidencePolarityContainerClass(evidence.polarity)}`}
        key={evidence.id}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{evidence.companyName} · {PROFILE_SOURCE_LABELS_I18N[locale][evidence.sourceKind]}</span>
          <EvidencePolarityBadge polarity={evidence.polarity} />
        </div>
        <h3 className="mt-1 text-sm font-semibold">{evidence.question}</h3>
        <p className="mt-2 text-sm leading-6">{evidence.excerpt}</p>
        {evidence.observationId ? <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => onCorrect(evidence.observationId!, evidence.observationStatus === "excluded" ? "restore" : "exclude")} size="sm" variant="ghost">
            {evidence.observationStatus === "excluded" ? t.restoreEvidence : t.excludeEvidence}
          </Button>
          <select aria-label={t.reassignAria} className="rounded border border-border px-2 text-xs" defaultValue="" onChange={(event) => {
            if (event.target.value) void onCorrect(evidence.observationId!, "reassign_dimension", event.target.value as ProfileDimension);
          }}>
            <option value="">{t.reassign}</option>{PROFILE_DIMENSIONS.filter((item) => item !== insight.dimension).map((item) => <option key={item} value={item}>{PROFILE_DIMENSION_LABELS_I18N[locale][item]}</option>)}
          </select>
        </div> : null}
      </article>)}
    </div>
  </aside>;
}
