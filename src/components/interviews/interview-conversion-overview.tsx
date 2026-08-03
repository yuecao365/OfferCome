import type { RatioMetric } from "@/lib/interviews/analytics";

export function InterviewConversionOverview({
  averageMockScore,
  completedMockCount,
  metrics,
}: {
  averageMockScore: number | null;
  completedMockCount: number;
  metrics: RatioMetric[];
}) {
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
              {metric.value === null ? "数据不足" : `${metric.value}%`}
            </strong>
          </div>
          <div
            aria-label={`${metric.label}：${metric.value === null ? "数据不足" : `${metric.value}%`}`}
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
            {metric.denominator > 0 ? `${metric.numerator} / ${metric.denominator}` : "暂无可计算样本"}
          </p>
        </div>
      ))}

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-sm font-semibold text-foreground">模拟面试平均分</p>
          <p className="mt-1 text-xs text-muted-foreground">来自 {completedMockCount} 次已完成训练</p>
        </div>
        <strong className="text-xl font-semibold text-foreground">
          {averageMockScore === null ? "暂无" : `${averageMockScore} 分`}
        </strong>
      </div>
    </div>
  );
}
