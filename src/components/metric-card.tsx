import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function MetricCard({
  label,
  value,
  helper,
  icon,
  emphasis = false,
}: {
  label: string;
  value: number | string;
  helper?: string;
  icon?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card className={cn("p-4", emphasis && "border-brand/20 bg-accent/45")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? <span className="text-brand">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-foreground">
        {value}
      </p>
      {helper ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p>
      ) : null}
    </Card>
  );
}
