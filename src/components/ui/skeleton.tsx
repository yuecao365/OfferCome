import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export function LoadingState({ label = "正在加载内容" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="grid gap-3" role="status">
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
