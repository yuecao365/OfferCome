"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { chartAxisTick, chartTooltipStyle } from "@/components/dashboard/chart-theme";
import type { ApplicationTrendPoint } from "@/lib/applications/types";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    chartLabel: (range: string, granularity: string) => `${range}按${granularity}聚合的投递数量趋势图`,
    count: (n: string) => `${n} 个岗位`,
    seriesName: "投递数量",
    period: (granularity: string, label: string) => `${granularity}：${label}`,
  },
  en: {
    chartLabel: (range: string, granularity: string) => `Trend chart of applications, ${range.toLowerCase()}, grouped by ${granularity}`,
    count: (n: string) => `${n} applications`,
    seriesName: "Applications",
    period: (granularity: string, label: string) => `${granularity.charAt(0).toUpperCase()}${granularity.slice(1)}: ${label}`,
  },
});

export default function ApplicationTrendChartInner({
  data,
  granularityLabel,
  rangeDescription,
}: {
  data: ApplicationTrendPoint[];
  granularityLabel: string;
  rangeDescription: string;
}) {
  const t = useMessages(messages);
  return (
    <div
      aria-label={t.chartLabel(rangeDescription, granularityLabel)}
      className="h-64 min-w-0 w-full overflow-hidden"
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="applicationTrend" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            axisLine={{ stroke: "var(--border)" }}
            dataKey="label"
            minTickGap={20}
            tick={chartAxisTick}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={chartAxisTick}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            formatter={(value) => [t.count(String(value)), t.seriesName]}
            labelFormatter={(label) => t.period(granularityLabel, String(label))}
          />
          <Area
            activeDot={{ fill: "var(--chart-1)", r: 3, strokeWidth: 0 }}
            animationDuration={400}
            dataKey="count"
            dot={false}
            fill="url(#applicationTrend)"
            stroke="var(--chart-1)"
            strokeWidth={1.5}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
