"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/ui/empty-state";
import {
  PROFILE_DIMENSIONS,
  PROFILE_DIMENSION_GROUPS,
  PROFILE_DIMENSION_LABELS,
  type ProfileDimension,
} from "@/lib/candidate-profile/types";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type AbilityMetric = {
  dimension: ProfileDimension;
  level: number | null;
  levelLabel: string;
  evidenceConfidence: number;
  confidenceLabel: string;
  interviewCount: number;
};

type ProfileSnapshot = {
  id: string;
  createdAt: string;
  metrics: Array<{
    dimension: ProfileDimension;
    level: number | null;
    levelLabel: string;
  }>;
};

const DIMENSION_COLORS: Record<ProfileDimension, string> = {
  answer_relevance: "var(--brand)",
  knowledge_accuracy: "var(--info)",
  reasoning_depth: "var(--success)",
  problem_solving: "var(--warning)",
  experience_evidence: "var(--danger)",
  communication_clarity: "var(--accent-foreground)",
  delivery_fluency: "var(--muted-foreground)",
  reflection_growth: "var(--foreground)",
};

function confidenceClass(confidence: number): string {
  if (confidence < 0.45) return "border-dashed opacity-45";
  if (confidence < 0.72) return "border-dashed opacity-70";
  return "opacity-100";
}

/**
 * 数据稀疏时 8 维平铺只会得到一排空表盘，因此按"内容力/证据力/表达力"
 * 三组呈现；组内没有数据的稀疏信号（如无录音时的口语维度）不再占位。
 * 面试少于 3 场的等级标注"初步"，给结论但留有余地。
 */
export function ProfileAbilityBars({
  metrics,
  onSelect,
}: {
  metrics: AbilityMetric[];
  onSelect: (dimension: ProfileDimension) => void;
}) {
  return (
    <div aria-label="能力分组等级与证据置信度" className="grid gap-5">
      {PROFILE_DIMENSION_GROUPS.map((group) => {
        const groupMetrics = group.dimensions.map((dimension) => ({
          dimension,
          metric: metrics.find((item) => item.dimension === dimension),
        }));
        const withData = groupMetrics.filter(
          ({ metric }) => metric?.level !== null && metric?.level !== undefined,
        );
        return (
          <section className="grid gap-3" key={group.key}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
              <span className="text-xs text-muted-foreground">{group.description}</span>
            </div>
            {withData.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong bg-surface-subtle p-3 text-sm text-muted-foreground">
                这一组还没有可用证据，完成一场面试或模拟面试后出现。
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {withData.map(({ dimension, metric }) => {
                  const width = Math.max(0, Math.min(100, ((metric!.level ?? 0) / 5) * 100));
                  const tentative = (metric!.interviewCount ?? 0) < 3;
                  return (
                    <button
                      aria-label={`${PROFILE_DIMENSION_LABELS[dimension]}，${metric!.levelLabel}，证据${metric!.confidenceLabel}`}
                      className={`rounded-xl border bg-surface p-4 text-left transition-colors hover:border-brand/40 ${confidenceClass(metric!.evidenceConfidence)}`}
                      key={dimension}
                      onClick={() => onSelect(dimension)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-foreground">
                          {PROFILE_DIMENSION_LABELS[dimension]}
                        </span>
                        <span className="text-sm font-semibold text-brand">
                          {metric!.levelLabel}
                          {tentative ? (
                            <span className="ml-1 font-normal text-muted-foreground">初步</span>
                          ) : null}
                        </span>
                      </span>
                      <span className="mt-3 block h-2.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${width}%` }}
                        />
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{metric!.interviewCount} 场证据</span>
                        <span>置信度：{metric!.confidenceLabel}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function ProfileTimelineChart({ snapshots }: { snapshots: ProfileSnapshot[] }) {
  const reducedMotion = useReducedMotion();
  const availableDimensions = useMemo(
    () =>
      PROFILE_DIMENSIONS.filter((dimension) =>
        snapshots.some((snapshot) =>
          snapshot.metrics.some(
            (metric) => metric.dimension === dimension && metric.level !== null,
          ),
        ),
      ),
    [snapshots],
  );
  const [visibleDimensions, setVisibleDimensions] = useState<ProfileDimension[]>(
    availableDimensions,
  );
  const data = useMemo(
    () =>
      [...snapshots]
        .reverse()
        .map((snapshot) => ({
          // 同一天可能有多次刷新：横轴键必须唯一到分钟，
          // 否则重复的日期类目会让悬停提示对不上节点。
          date: (() => {
            const stamp = new Date(snapshot.createdAt);
            const pad = (value: number) => String(value).padStart(2, "0");
            return `${stamp.getMonth() + 1}/${stamp.getDate()} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`;
          })(),
          ...Object.fromEntries(
            snapshot.metrics.flatMap((metric) =>
              metric.level === null ? [] : [[metric.dimension, metric.level]],
            ),
          ),
        })),
    [snapshots],
  );

  if (availableDimensions.length === 0) {
    return (
      <EmptyState
        description="能力画像更新后会在这里记录变化。"
        title="还没有成长记录"
      />
    );
  }

  const toggleDimension = (dimension: ProfileDimension) => {
    setVisibleDimensions((current) =>
      current.includes(dimension)
        ? current.filter((item) => item !== dimension)
        : [...current, dimension],
    );
  };

  return (
    <div className="grid gap-4">
      <div aria-label="选择成长记录维度" className="flex flex-wrap gap-2">
        {availableDimensions.map((dimension) => {
          const active = visibleDimensions.includes(dimension);
          return (
            <button
              aria-pressed={active}
              className={active
                ? "rounded-lg border border-brand bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-foreground"
                : "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground"
              }
              key={dimension}
              onClick={() => toggleDimension(dimension)}
              type="button"
            >
              {PROFILE_DIMENSION_LABELS[dimension]}
            </button>
          );
        })}
      </div>
      <div aria-label="能力等级成长时间轴" className="h-80 rounded-xl border border-border bg-surface p-3" role="img">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ bottom: 8, left: -12, right: 12, top: 12 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
            <XAxis dataKey="date" minTickGap={24} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <YAxis domain={[1, 5]} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} ticks={[1, 2, 3, 4, 5]} />
            <Tooltip
              contentStyle={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--foreground)",
              }}
              labelStyle={{ color: "var(--foreground)" }}
            />
            {visibleDimensions.map((dimension) => (
              <Line
                animationDuration={500}
                connectNulls
                dataKey={dimension}
                dot={{ r: 3 }}
                isAnimationActive={!reducedMotion}
                key={dimension}
                name={PROFILE_DIMENSION_LABELS[dimension]}
                stroke={DIMENSION_COLORS[dimension]}
                strokeWidth={2}
                type="monotone"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MiniHistoryChart({ points }: { points: Array<{ date: string; level: number }> }) {
  const reducedMotion = useReducedMotion();
  const data = points.map((point) => ({
    date: point.date.slice(0, 10),
    level: point.level,
  }));
  return (
    <div className="mt-5">
      <p className="mb-2 text-xs text-muted-foreground">历史等级曲线</p>
      <div aria-label="历史等级变化" className="h-24 w-full" role="img">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ bottom: 4, left: 4, right: 4, top: 4 }}>
            <Line
              animationDuration={400}
              dataKey="level"
              dot={{ fill: "var(--brand)", r: 2.5 }}
              isAnimationActive={!reducedMotion}
              stroke="var(--brand)"
              strokeWidth={3}
              type="monotone"
            />
            <YAxis domain={[1, 5]} hide />
            <XAxis dataKey="date" hide />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
