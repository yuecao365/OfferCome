"use client";

import { SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/** 筛选工具条：一行主控件，可折叠的「更多筛选」在下一行整行展开。 */
export function FilterToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** 主控件里的搜索框外壳：固定宽度，图标叠在左侧。 */
export function FilterSearch({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="relative w-full sm:w-64">
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}

/** 主控件里的下拉外壳：固定宽度，避免 Select 的 w-full 撑满一行。 */
export function FilterSelect({ children }: { children: ReactNode }) {
  return <span className="block w-full sm:w-40">{children}</span>;
}

/**
 * 更多筛选：按钮在主行，面板另起一行整行展开；
 * 有高级条件生效时默认展开并在按钮上亮一个点。
 */
export function FilterMore({
  active,
  label = "更多筛选",
  children,
}: {
  active: boolean;
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(active);
  const panelId = useId();
  return (
    <>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[0.8125rem] transition-colors duration-150",
          open ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        {label}
        {active ? <span aria-label="已启用更多筛选" className="size-1.5 rounded-full bg-brand" /> : null}
      </button>
      <div
        className={cn(
          "basis-full rounded-panel border border-border bg-surface-subtle p-3",
          !open && "hidden",
        )}
        id={panelId}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{children}</div>
      </div>
    </>
  );
}
