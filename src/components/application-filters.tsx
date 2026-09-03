import { Search, SlidersHorizontal } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { FieldLabel, Input, Select } from "@/components/ui/form-controls";
import {
  APPLICATION_STAGES,
  type ApplicationFilters,
  stageLabel,
} from "@/lib/applications/types";

type ApplicationFiltersProps = {
  filters: ApplicationFilters;
  sources: string[];
};

export function ApplicationFilters({
  filters,
  sources,
}: ApplicationFiltersProps) {
  const hasAdvancedFilters = Boolean(
    filters.from ||
      filters.to ||
      filters.sortBy !== "updatedAt" ||
      filters.sortDir !== "desc" ||
      filters.pageSize !== 12,
  );
  const hasAnyFilter =
    hasAdvancedFilters ||
    Boolean(filters.q) ||
    filters.status !== "all" ||
    filters.source !== "all";

  return (
    <FilterForm action="/applications" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-64">
          <span className="sr-only">搜索岗位</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            className="pl-8"
            defaultValue={filters.q}
            name="q"
            placeholder="搜索公司或岗位"
            type="search"
          />
        </label>
        <span className="block w-full sm:w-40">
          <Select aria-label="流程状态" defaultValue={filters.status} name="status">
            <option value="all">全部状态</option>
            {APPLICATION_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabel(stage)}
              </option>
            ))}
          </Select>
        </span>
        <span className="block w-full sm:w-40">
          <Select aria-label="来源" defaultValue={filters.source} name="source">
            <option value="all">全部来源</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </Select>
        </span>
        <details className="contents" open={hasAdvancedFilters || undefined}>
          <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-control px-2.5 text-[0.8125rem] text-muted-foreground hover:bg-muted hover:text-foreground">
            <SlidersHorizontal aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            更多筛选
            {hasAdvancedFilters ? (
              <span aria-label="已启用更多筛选" className="size-1.5 rounded-full bg-brand" />
            ) : null}
          </summary>
          <div className="grid w-full gap-2 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-5">
            <FieldLabel>
              开始日期
              <Input defaultValue={filters.from} name="from" type="date" />
            </FieldLabel>
            <FieldLabel>
              结束日期
              <Input defaultValue={filters.to} name="to" type="date" />
            </FieldLabel>
            <FieldLabel>
              排序字段
              <Select defaultValue={filters.sortBy} name="sortBy">
                <option value="updatedAt">状态更新时间</option>
                <option value="appliedAt">投递时间</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              排序方向
              <Select defaultValue={filters.sortDir} name="sortDir">
                <option value="desc">从新到旧</option>
                <option value="asc">从旧到新</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              每页数量
              <Select defaultValue={String(filters.pageSize)} name="pageSize">
                <option value="12">12 条</option>
                <option value="20">20 条</option>
                <option value="50">50 条</option>
                <option value="100">100 条</option>
              </Select>
            </FieldLabel>
          </div>
        </details>
        {hasAnyFilter ? (
          <ButtonLink className="ml-auto" href="/applications" size="sm" variant="ghost">
            清空筛选
          </ButtonLink>
        ) : null}
      </div>
    </FilterForm>
  );
}
