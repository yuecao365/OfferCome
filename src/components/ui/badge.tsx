import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  brand: "border-brand/15 bg-accent text-accent-foreground",
  info: "border-info/20 bg-info-soft text-info-strong",
  success: "border-success/20 bg-success-soft text-success-strong",
  warning: "border-warning/25 bg-warning-soft text-warning-strong",
  danger: "border-danger/20 bg-danger-soft text-danger-strong",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold leading-none",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
