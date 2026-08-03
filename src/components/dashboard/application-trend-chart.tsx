"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import type { ApplicationTrendPoint } from "@/lib/applications/types";

const ApplicationTrendChartInner = dynamic(
  () => import("./application-trend-chart-inner"),
  {
    loading: () => <Skeleton className="h-72 w-full" />,
    ssr: false,
  },
);

export function ApplicationTrendChart({
  data,
  granularityLabel,
  rangeDescription,
}: {
  data: ApplicationTrendPoint[];
  granularityLabel: string;
  rangeDescription: string;
}) {
  return (
    <ApplicationTrendChartInner
      data={data}
      granularityLabel={granularityLabel}
      rangeDescription={rangeDescription}
    />
  );
}
