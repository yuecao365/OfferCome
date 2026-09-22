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
import {
  INTERVIEW_QUESTION_CATEGORIES,
  INTERVIEW_QUESTION_CATEGORY_LABELS,
  INTERVIEW_ROUND_LABELS,
  INTERVIEW_ROUNDS,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUSES,
  type InterviewFilters,
  type InterviewListItem,
  type InterviewStats,
  type ResumeProjectOption,
} from "@/lib/interviews/types";

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
        title="历史面试"
      />

      {stats ? (
        <StatTiles
          tiles={[
            { label: "真实面试", value: stats.total, note: "已记录的真实面试" },
            { label: "进行中", value: stats.active, note: "还没出结果的", tone: accentIf(stats.active) },
            { label: "待面", value: stats.preparing, note: "已排期、还没面", tone: toneIf(stats.preparing, "info") },
            { label: "Offer", value: stats.offers, note: "面出 Offer 的", tone: toneIf(stats.offers, "success") },
          ]}
        />
      ) : null}
      <Card className="grid gap-4 p-4 sm:p-5">
      <FilterForm action="/interviews/history">
        <FilterToolbar>
          <FilterSearch label="搜索">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.5}
            />
            <Input
              className="pl-8"
              defaultValue={filters.q}
              name="q"
              placeholder="搜索公司、岗位或问题"
              type="search"
            />
          </FilterSearch>
          <FilterSelect>
            <Select aria-label="面试类型" defaultValue={filters.kind} name="kind">
              <option value="all">真实与模拟</option>
              <option value="real">真实面试</option>
              <option value="mock">AI 模拟</option>
            </Select>
          </FilterSelect>
          <FilterSelect>
            <Select aria-label="状态" defaultValue={filters.status} name="status">
              <option value="all">全部状态</option>
              {INTERVIEW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {INTERVIEW_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FilterSelect>
          <FilterSelect>
            <Select aria-label="轮次" defaultValue={filters.round} name="round">
              <option value="all">全部轮次</option>
              {INTERVIEW_ROUNDS.map((round) => (
                <option key={round} value={round}>
                  {INTERVIEW_ROUND_LABELS[round]}
                </option>
              ))}
            </Select>
          </FilterSelect>
          {hasAnyFilter ? (
            <ButtonLink className="ml-auto" href="/interviews/history" size="sm" variant="ghost">
              清空筛选
            </ButtonLink>
          ) : null}
          <FilterMore active={hasAdvancedFilters}>
            <FieldLabel>
              问题类型
              <Select defaultValue={filters.category} name="category">
                <option value="all">全部类型</option>
                {INTERVIEW_QUESTION_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {INTERVIEW_QUESTION_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel>
              排序
              <Select defaultValue={filters.sort} name="sort">
                <option value="newest">最新在前</option>
                <option value="oldest">最早在前</option>
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
        ariaLabel="历史面试分页"
        hrefForPage={historyHref}
        page={interviewPage.page}
        total={interviewPage.total}
        totalPages={interviewPage.totalPages}
        unit="场"
      />
      </Card>
    </>
  );
}
