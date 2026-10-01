"use client";

import type { RatioMetric } from "@/lib/interviews/analytics";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    insufficient: "数据不足",
    noSample: "暂无可计算样本",
    mockAverage: "模拟面试平均分",
    mockSource: (n: number) => `来自 ${n} 次已完成训练`,
    none: "暂无",
    score: (n: number) => `${n} 分`,
    ariaLabel: (label: string, value: string) => `${label}：${value}`,
  },
  en: {
    insufficient: "Not enough data",
    noSample: "No samples to calculate yet",
    mockAverage: "Mock interview average",
    mockSource: (n: number) => `From ${n} completed session${n === 1 ? "" : "s"}`,
    none: "None yet",
    score: (n: number) => `${n} pts`,
    ariaLabel: (label: string, value: string) => `${label}: ${value}`,
  },
});

export function InterviewConversionOverview({
  averageMockScore,
  completedMockCount,
  metrics,
}: {
  averageMockScore: number | null;
  completedMockCount: number;
  metrics: RatioMetric[];
}) {
  const t = useMessages(messages);
  return (
    <div className="grid gap-5">
      {metrics.map((metric) => (
        <div key={metric.key}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{metric.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.helper}</p>
            </div>
            <strong className="shrink-0 text-xl font-semibold text-foreground">
              {metric.value === null ? t.insufficient : `${metric.value}%`}
            </strong>
          </div>
          <div
            aria-label={t.ariaLabel(metric.label, metric.value === null ? t.insufficient : `${metric.value}%`)}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={metric.value ?? undefined}
            className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${metric.value ?? 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {metric.denominator > 0 ? `${metric.numerator} / ${metric.denominator}` : t.noSample}
          </p>
        </div>
      ))}

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{t.mockAverage}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.mockSource(completedMockCount)}</p>
        </div>
        <strong className="text-xl font-semibold text-foreground">
          {averageMockScore === null ? t.none : t.score(averageMockScore)}
        </strong>
      </div>
    </div>
  );
}
