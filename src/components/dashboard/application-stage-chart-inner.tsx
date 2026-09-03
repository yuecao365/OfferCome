"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { chartAxisTick, chartTooltipStyle } from "@/components/dashboard/chart-theme";
import type { ApplicationStageChartPoint } from "@/lib/applications/analytics";
import type { ApplicationStage } from "@/lib/applications/types";

/** 颜色只表达语义：未推进为灰，推进中为品牌色，结果态用成功/失败色。 */
const stageColors: Record<ApplicationStage, string> = {
  applied: "var(--muted-foreground)",
  assessment: "var(--brand)",
  first_interview: "var(--brand)",
  second_interview: "var(--brand)",
  third_interview: "var(--brand)",
  hr_interview: "var(--brand)",
  offer: "var(--success)",
  rejected: "var(--danger)",
};

export default function ApplicationStageChartInner({
  data,
}: {
  data: ApplicationStageChartPoint[];
}) {
  return (
    <div className="h-64 min-w-0 w-full" role="img" aria-label="岗位当前阶段横向条形图">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} layout="vertical" margin={{ bottom: 0, left: 0, right: 16, top: 0 }}>
          <XAxis
            allowDecimals={false}
            axisLine={false}
            tick={chartAxisTick}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="label"
            tick={{ ...chartAxisTick, fontFamily: "var(--font-sans)" }}
            tickLine={false}
            type="category"
            width={64}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={{ fill: "var(--surface-subtle)" }}
            formatter={(value) => [`${String(value)} 个岗位`, "当前数量"]}
          />
          <Bar animationDuration={400} barSize={10} dataKey="count" radius={[0, 2, 2, 0]}>
            {data.map((point) => (
              <Cell fill={stageColors[point.stage]} key={point.stage} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
