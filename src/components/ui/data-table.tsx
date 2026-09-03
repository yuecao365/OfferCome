import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * 列表表格的基础件：发丝线外框、无底色表头、行 hover 才显示操作。
 * 只负责样式，列定义由调用方决定。
 */
export function DataTable({
  className,
  minWidthClassName = "min-w-[880px]",
  children,
}: {
  className?: string;
  minWidthClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-panel border border-border bg-surface", className)}>
      <div className="overflow-x-auto">
        <table className={cn("w-full border-collapse text-left text-[0.8125rem]", minWidthClassName)}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function DataTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border text-xs text-muted-foreground">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("h-9 whitespace-nowrap px-4 font-medium", className)} {...props} />
  );
}

export function DataTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function DataRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("group transition-colors duration-150 hover:bg-surface-subtle", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

/** 时间、来源、计数等元数据：等宽小字。 */
export function MetaText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground", className)}
      {...props}
    />
  );
}

/** 行操作：鼠标悬停或键盘聚焦到该行时显示；触屏设备始终显示。 */
export function RowActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
      {children}
    </div>
  );
}
