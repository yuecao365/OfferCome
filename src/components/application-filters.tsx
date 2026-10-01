"use client";

import { Search } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { FilterMore, FilterSearch, FilterSelect, FilterToolbar } from "@/components/ui/filter-toolbar";
import { FieldLabel, Input, Select } from "@/components/ui/form-controls";
import {
  APPLICATION_STAGE_LABELS_I18N,
  APPLICATION_STAGES,
  type ApplicationFilters,
} from "@/lib/applications/types";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    search: "搜索岗位",
    searchPlaceholder: "搜索公司或岗位",
    stage: "流程状态",
    allStages: "全部状态",
    source: "来源",
    allSources: "全部来源",
    clear: "清空筛选",
    from: "开始日期",
    to: "结束日期",
    sortBy: "排序字段",
    sortByUpdated: "状态更新时间",
    sortByApplied: "投递时间",
    sortDir: "排序方向",
    newestFirst: "从新到旧",
    oldestFirst: "从旧到新",
    pageSize: "每页数量",
    perPage: (n: number) => `${n} 条`,
  },
  en: {
    search: "Search applications",
    searchPlaceholder: "Search company or role",
    stage: "Stage",
    allStages: "All stages",
    source: "Source",
    allSources: "All sources",
    clear: "Clear filters",
    from: "From",
    to: "To",
    sortBy: "Sort by",
    sortByUpdated: "Stage updated",
    sortByApplied: "Applied date",
    sortDir: "Order",
    newestFirst: "Newest first",
    oldestFirst: "Oldest first",
    pageSize: "Per page",
    perPage: (n: number) => `${n}`,
  },
});

type ApplicationFiltersProps = {
  filters: ApplicationFilters;
  sources: string[];
};

export function ApplicationFilters({
  filters,
  sources,
}: ApplicationFiltersProps) {
  const t = useMessages(messages);
  const locale = useLocale();
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
    <FilterForm action="/applications">
      <FilterToolbar>
        <FilterSearch label={t.search}>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            className="pl-8"
            defaultValue={filters.q}
            name="q"
            placeholder={t.searchPlaceholder}
            type="search"
          />
        </FilterSearch>
        <FilterSelect>
          <Select aria-label={t.stage} defaultValue={filters.status} name="status">
            <option value="all">{t.allStages}</option>
            {APPLICATION_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {APPLICATION_STAGE_LABELS_I18N[locale][stage]}
              </option>
            ))}
          </Select>
        </FilterSelect>
        <FilterSelect>
          <Select aria-label={t.source} defaultValue={filters.source} name="source">
            <option value="all">{t.allSources}</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </Select>
        </FilterSelect>
        {hasAnyFilter ? (
          <ButtonLink className="ml-auto" href="/applications" size="sm" variant="ghost">
            {t.clear}
          </ButtonLink>
        ) : null}
        <FilterMore active={hasAdvancedFilters}>
          <FieldLabel>
            {t.from}
            <Input defaultValue={filters.from} name="from" type="date" />
          </FieldLabel>
          <FieldLabel>
            {t.to}
            <Input defaultValue={filters.to} name="to" type="date" />
          </FieldLabel>
          <FieldLabel>
            {t.sortBy}
            <Select defaultValue={filters.sortBy} name="sortBy">
              <option value="updatedAt">{t.sortByUpdated}</option>
              <option value="appliedAt">{t.sortByApplied}</option>
            </Select>
          </FieldLabel>
          <FieldLabel>
            {t.sortDir}
            <Select defaultValue={filters.sortDir} name="sortDir">
              <option value="desc">{t.newestFirst}</option>
              <option value="asc">{t.oldestFirst}</option>
            </Select>
          </FieldLabel>
          <FieldLabel>
            {t.pageSize}
            <Select defaultValue={String(filters.pageSize)} name="pageSize">
              {[12, 20, 50, 100].map((size) => (
                <option key={size} value={String(size)}>
                  {t.perPage(size)}
                </option>
              ))}
            </Select>
          </FieldLabel>
        </FilterMore>
      </FilterToolbar>
    </FilterForm>
  );
}
