"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ApplicationStageChartPoint } from "@/lib/applications/analytics";
import type { ApplicationStage } from "@/lib/applications/types";

const stageColors: Record<ApplicationStage, string> = {
  applied: "var(--info)",
  assessment: "var(--warning)",
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
    <div className="h-72 min-w-0 w-full" role="img" aria-label="岗位当前阶段横向条形图">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} layout="vertical" margin={{ bottom: 0, left: 2, right: 18, top: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            allowDecimals={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            type="category"
            width={72}
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
            formatter={(value) => [`${String(value)} 个岗位`, "当前数量"]}
          />
          <Bar animationDuration={450} barSize={14} dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((point) => (
              <Cell fill={stageColors[point.stage]} key={point.stage} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
