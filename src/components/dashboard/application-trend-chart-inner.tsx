"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
      className="h-72 min-w-0 w-full overflow-hidden"
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="applicationTrend" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.24} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="label"
            minTickGap={20}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            width={42}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "var(--app-shadow-card)",
              color: "var(--foreground)",
              fontSize: 12,
            }}
            formatter={(value) => [`${String(value)} 个岗位`, "投递数量"]}
            labelFormatter={(label) => `${granularityLabel}：${String(label)}`}
          />
          <Area
            animationDuration={500}
            dataKey="count"
            dot={data.length <= 14 ? { fill: "var(--brand)", r: 2.5, strokeWidth: 0 } : false}
            fill="url(#applicationTrend)"
            activeDot={{ fill: "var(--surface)", r: 4, stroke: "var(--brand)", strokeWidth: 2 }}
            stroke="var(--brand)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
