import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

/** 徽章统一为「灰底 + 彩色圆点」；只有 success 用浅色填充，让 Offer 一类的结果状态更醒目。 */
const dots: Record<BadgeTone, string> = {
  neutral: "bg-muted-foreground",
  brand: "bg-brand",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function Badge({
  className,
  tone = "neutral",
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-control border border-border bg-surface px-2 text-xs font-medium text-foreground",
        tone === "success" && "border-success/25 bg-success-soft text-success-strong",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} />
      {children}
    </span>
  );
}
