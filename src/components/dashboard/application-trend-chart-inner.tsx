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

export default function ApplicationTrendChartInner({
  data,
  granularityLabel,
  rangeDescription,
}: {
  data: ApplicationTrendPoint[];
  granularityLabel: string;
  rangeDescription: string;
}) {
  return (
    <div
      aria-label={`${rangeDescription}按${granularityLabel}聚合的投递数量趋势图`}
      className="h-64 min-w-0 w-full overflow-hidden"
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="applicationTrend" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
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
            formatter={(value) => [`${String(value)} 个岗位`, "投递数量"]}
            labelFormatter={(label) => `${granularityLabel}：${String(label)}`}
          />
          <Area
            activeDot={{ fill: "var(--brand)", r: 3, strokeWidth: 0 }}
            animationDuration={400}
            dataKey="count"
            dot={false}
            fill="url(#applicationTrend)"
            stroke="var(--brand)"
            strokeWidth={1.5}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
