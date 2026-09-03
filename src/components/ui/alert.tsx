import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type AlertTone = "info" | "success" | "warning" | "danger";

const alertStyles: Record<AlertTone, string> = {
  info: "border-info/20 bg-info-soft text-info-strong",
  success: "border-success/20 bg-success-soft text-success-strong",
  warning: "border-warning/20 bg-warning-soft text-warning-strong",
  danger: "border-danger/20 bg-danger-soft text-danger-strong",
};

const alertIcons = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export function Alert({
  className,
  tone = "info",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: AlertTone }) {
  const Icon = alertIcons[tone];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-control border px-3.5 py-2.5 text-[0.8125rem] leading-5",
        alertStyles[tone],
        className,
      )}
      role={tone === "danger" ? "alert" : "status"}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
