"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import type { ApplicationStageChartPoint } from "@/lib/applications/analytics";

const ApplicationStageChartInner = dynamic(
  () => import("./application-stage-chart-inner"),
  {
    loading: () => <Skeleton className="h-72 w-full" />,
    ssr: false,
  },
);

export function ApplicationStageChart({ data }: { data: ApplicationStageChartPoint[] }) {
  return <ApplicationStageChartInner data={data} />;
}
