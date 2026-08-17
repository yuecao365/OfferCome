"use client";

import { useCountUp } from "@/lib/use-count-up";

export function CountUp({
  value,
  duration,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const display = useCountUp(value, duration);
  return <span className={className}>{display}</span>;
}
