import { PageNumbers } from "@/components/ui/page-numbers";
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
      <PageNumbers
        ariaLabel="岗位列表页码"
        hrefForPage={(target) => pageHref(filters, target)}
        page={page}
        totalPages={totalPages}
      />
    </nav>
  );
}
