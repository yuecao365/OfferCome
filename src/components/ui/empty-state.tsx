import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** 空状态：一句话说明 + 单一主行动，不放插画和图标方块。 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "dot-grid flex min-h-48 flex-col items-center justify-center rounded-panel border border-dashed border-border-strong px-6 py-10 text-center",
        className,
      )}
    >
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-md text-[0.8125rem] leading-5 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
