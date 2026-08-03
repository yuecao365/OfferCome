import { ChevronLeft, ChevronRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import type { ApplicationFilters } from "@/lib/applications/types";

type PaginationProps = {
  filters: ApplicationFilters;
  page: number;
  totalPages: number;
  total: number;
};

function pageHref(filters: ApplicationFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sortBy !== "updatedAt") params.set("sortBy", filters.sortBy);
  if (filters.sortDir !== "desc") params.set("sortDir", filters.sortDir);
  if (filters.pageSize !== 12) params.set("pageSize", String(filters.pageSize));
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/applications?${query}` : "/applications";
}

export function Pagination({ filters, page, totalPages, total }: PaginationProps) {
  return (
    <nav
      aria-label="岗位列表分页"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground shadow-card sm:flex-row sm:items-center sm:justify-between"
    >
      <span>
        共 {total} 条 · 第 {page} / {totalPages} 页
      </span>
      <div className="flex gap-2">
        <ButtonLink
          aria-disabled={page <= 1}
          className={page <= 1 ? "pointer-events-none opacity-40" : undefined}
          href={pageHref(filters, Math.max(1, page - 1))}
          size="sm"
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          上一页
        </ButtonLink>
        <ButtonLink
          aria-disabled={page >= totalPages}
          className={page >= totalPages ? "pointer-events-none opacity-40" : undefined}
          href={pageHref(filters, Math.min(totalPages, page + 1))}
          size="sm"
          variant="outline"
        >
          下一页
          <ChevronRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </div>
    </nav>
  );
}
