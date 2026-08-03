import { Search, SlidersHorizontal } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  return (
    <Card className="p-4">
      <form action="/applications" className="grid gap-4" method="get">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_auto] xl:items-end">
          <FieldLabel>
            搜索岗位
            <span className="relative">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                defaultValue={filters.q}
                name="q"
                placeholder="公司或岗位名称"
                type="search"
              />
            </span>
          </FieldLabel>
          <FieldLabel>
            流程状态
            <Select defaultValue={filters.status} name="status">
              <option value="all">全部状态</option>
              {APPLICATION_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabel(stage)}
                </option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel>
            来源
            <Select defaultValue={filters.source} name="source">
              <option value="all">全部来源</option>
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
          </FieldLabel>
          <Button type="submit">应用筛选</Button>
        </div>

        <details className="group" open={hasAdvancedFilters || undefined}>
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            更多筛选
            {hasAdvancedFilters ? (
              <span className="rounded-md bg-accent px-1.5 py-0.5 text-[0.6875rem] text-accent-foreground">
                已启用
              </span>
            ) : null}
          </summary>
          <div className="mt-3 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-5">
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

        <div className="flex justify-end border-t border-border pt-3">
          <ButtonLink href="/applications" size="sm" variant="ghost">
            清空全部筛选
          </ButtonLink>
        </div>
      </form>
    </Card>
  );
}
