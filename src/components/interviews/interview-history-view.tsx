"use client";

import { Search } from "lucide-react";
import type { ComponentProps } from "react";

import { InterviewList } from "@/components/interviews/interview-list";
import { NewInterviewModal } from "@/components/interviews/interview-modals";
import { PageHeader } from "@/components/page-header";
import { accentIf, StatTiles, toneIf } from "@/components/stat-tiles";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterForm } from "@/components/ui/filter-form";
import { FilterMore, FilterSearch, FilterSelect, FilterToolbar } from "@/components/ui/filter-toolbar";
import { FieldLabel, Input, Select } from "@/components/ui/form-controls";
import { ListPagination } from "@/components/ui/list-pagination";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import {
  INTERVIEW_QUESTION_CATEGORIES,
  INTERVIEW_QUESTION_CATEGORY_LABELS_I18N,
  INTERVIEW_ROUND_LABELS_I18N,
  INTERVIEW_ROUNDS,
  INTERVIEW_STATUS_LABELS_I18N,
  INTERVIEW_STATUSES,
  type InterviewFilters,
  type InterviewListItem,
  type InterviewStats,
  type ResumeProjectOption,
} from "@/lib/interviews/types";

const messages = defineMessages({
  "zh-CN": {
    title: "历史面试",
    realLabel: "真实面试",
    realNote: "已记录的真实面试",
    activeLabel: "进行中",
    activeNote: "还没出结果的",
    preparingLabel: "待面",
    preparingNote: "已排期、还没面",
    offerNote: "面出 Offer 的",
    search: "搜索",
    searchPlaceholder: "搜索公司、岗位或问题",
    kindAria: "面试类型",
    kindAll: "真实与模拟",
    kindReal: "真实面试",
    kindMock: "AI 模拟",
    statusAria: "状态",
    statusAll: "全部状态",
    roundAria: "轮次",
    roundAll: "全部轮次",
    clearFilters: "清空筛选",
    category: "问题类型",
    categoryAll: "全部类型",
    sort: "排序",
    newest: "最新在前",
    oldest: "最早在前",
    pagination: "历史面试分页",
    unit: "场",
  },
  en: {
    title: "Interview history",
    realLabel: "Real interviews",
    realNote: "Real interviews recorded",
    activeLabel: "In progress",
    activeNote: "No result yet",
    preparingLabel: "Upcoming",
    preparingNote: "Scheduled, not yet held",
    offerNote: "Ended in an offer",
    search: "Search",
    searchPlaceholder: "Search company, role or question",
    kindAria: "Interview type",
    kindAll: "Real and mock",
    kindReal: "Real interview",
    kindMock: "AI mock",
    statusAria: "Status",
    statusAll: "All statuses",
    roundAria: "Round",
    roundAll: "All rounds",
    clearFilters: "Clear filters",
    category: "Question type",
    categoryAll: "All types",
    sort: "Sort",
    newest: "Newest first",
    oldest: "Oldest first",
    pagination: "Interview history pages",
    unit: "interviews",
  },
});

/**
 * 历史面试页的呈现层。本地版（服务端取数）和体验版（浏览器取数）
 * 渲染同一个组件——界面一致不靠约定靠结构。
 * 版式：四张指标卡（真实面试 / 进行中 / 待面 / Offer，进行中 > 0 点亮）→ 一张卡装筛选条、列表、分页。
 */
export function InterviewHistoryView({
  filters,
  interviewPage,
  resumeProjects,
  stats,
  transcriptionConfigured,
  newInterview,
  list,
}: {
  filters: InterviewFilters;
  interviewPage: {
    interviews: InterviewListItem[];
    total: number;
    totalPages: number;
    page: number;
  };
  resumeProjects: ResumeProjectOption[];
  /** 真实面试的全量统计（不受筛选影响）；有就在顶部放指标卡。 */
  stats?: InterviewStats;
  transcriptionConfigured: boolean;
  /** 体验版在此注入浏览器动作与导入开关。 */
  newInterview?: Pick<
    ComponentProps<typeof NewInterviewModal>,
    "action" | "draftImportEnabled"
  >;
  list?: Pick<
    ComponentProps<typeof InterviewList>,
    "editActionFor" | "deleteActionFor"
  >;
}) {
  const locale = useLocale();
  const t = useMessages(messages);
  const historyHref = (page: number): string => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.kind !== "all") params.set("kind", filters.kind);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.round !== "all") params.set("round", filters.round);
    if (filters.category !== "all") params.set("category", filters.category);
    if (filters.sort !== "newest") params.set("sort", filters.sort);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/interviews/history?${query}` : "/interviews/history";
  };
  const hasAdvancedFilters = filters.category !== "all" || filters.sort !== "newest";
  const hasAnyFilter =
    hasAdvancedFilters ||
    Boolean(filters.q) ||
    filters.kind !== "all" ||
    filters.status !== "all" ||
    filters.round !== "all";

  return (
    <>
      <PageHeader
        actions={
          <NewInterviewModal
            resumeProjects={resumeProjects}
            transcriptionConfigured={transcriptionConfigured}
            {...newInterview}
          />
        }
        title={t.title}
      />

      {stats ? (
        <StatTiles
          tiles={[
            { label: t.realLabel, value: stats.total, note: t.realNote },
            { label: t.activeLabel, value: stats.active, note: t.activeNote, tone: accentIf(stats.active) },
            { label: t.preparingLabel, value: stats.preparing, note: t.preparingNote, tone: toneIf(stats.preparing, "info") },
            { label: "Offer", value: stats.offers, note: t.offerNote, tone: toneIf(stats.offers, "success") },
          ]}
        />
      ) : null}
      <Card className="grid gap-4 p-4 sm:p-5">
      <FilterForm action="/interviews/history">
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
            <Select aria-label={t.kindAria} defaultValue={filters.kind} name="kind">
              <option value="all">{t.kindAll}</option>
              <option value="real">{t.kindReal}</option>
              <option value="mock">{t.kindMock}</option>
            </Select>
          </FilterSelect>
          <FilterSelect>
            <Select aria-label={t.statusAria} defaultValue={filters.status} name="status">
              <option value="all">{t.statusAll}</option>
              {INTERVIEW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {INTERVIEW_STATUS_LABELS_I18N[locale][status]}
                </option>
              ))}
            </Select>
          </FilterSelect>
          <FilterSelect>
            <Select aria-label={t.roundAria} defaultValue={filters.round} name="round">
              <option value="all">{t.roundAll}</option>
              {INTERVIEW_ROUNDS.map((round) => (
                <option key={round} value={round}>
                  {INTERVIEW_ROUND_LABELS_I18N[locale][round]}
                </option>
              ))}
            </Select>
          </FilterSelect>
          {hasAnyFilter ? (
            <ButtonLink className="ml-auto" href="/interviews/history" size="sm" variant="ghost">
              {t.clearFilters}
            </ButtonLink>
          ) : null}
          <FilterMore active={hasAdvancedFilters}>
            <FieldLabel>
              {t.category}
              <Select defaultValue={filters.category} name="category">
                <option value="all">{t.categoryAll}</option>
                {INTERVIEW_QUESTION_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {INTERVIEW_QUESTION_CATEGORY_LABELS_I18N[locale][category]}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel>
              {t.sort}
              <Select defaultValue={filters.sort} name="sort">
                <option value="newest">{t.newest}</option>
                <option value="oldest">{t.oldest}</option>
              </Select>
            </FieldLabel>
          </FilterMore>
        </FilterToolbar>
      </FilterForm>

      <InterviewList
        interviews={interviewPage.interviews}
        resumeProjects={resumeProjects}
        {...list}
      />

      <ListPagination
        ariaLabel={t.pagination}
        hrefForPage={historyHref}
        page={interviewPage.page}
        total={interviewPage.total}
        totalPages={interviewPage.totalPages}
        unit={t.unit}
      />
      </Card>
    </>
  );
}
