import Link from "next/link";

import { cn } from "@/lib/cn";

export type SegmentedLinkItem = {
  href: string;
  label: string;
  active: boolean;
};

/** 一组互斥的链接选项（时间范围、来源、分类）：浅填充指示当前项，不用实心强调色。 */
export function SegmentedLinks({
  items,
  ariaLabel,
  className,
}: {
  items: SegmentedLinkItem[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-control bg-surface-sunken p-0.5", className)}
    >
      {items.map((item) => (
        <Link
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center whitespace-nowrap rounded-[4px] px-2.5 text-xs transition-colors duration-150",
            item.active
              ? "bg-surface font-medium text-foreground shadow-card"
              : "text-muted-foreground hover:text-foreground",
          )}
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
