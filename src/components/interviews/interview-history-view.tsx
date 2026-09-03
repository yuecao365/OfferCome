import type { ComponentProps } from "react";

import { InterviewList } from "@/components/interviews/interview-list";
import { NewInterviewModal } from "@/components/interviews/interview-modals";
import { PageHeader } from "@/components/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input, Select } from "@/components/ui/form-controls";
import { PageNumbers } from "@/components/ui/page-numbers";
import {
  INTERVIEW_QUESTION_CATEGORIES,
  INTERVIEW_QUESTION_CATEGORY_LABELS,
  INTERVIEW_ROUND_LABELS,
  INTERVIEW_ROUNDS,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUSES,
  type InterviewFilters,
  type InterviewListItem,
  type ResumeProjectOption,
} from "@/lib/interviews/types";

/**
 * 历史面试页的呈现层。本地版（服务端取数）和体验版（浏览器取数）
 * 渲染同一个组件——界面一致不靠约定靠结构。
 */
export function InterviewHistoryView({
  filters,
  interviewPage,
  resumeProjects,
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
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.round !== "all") params.set("round", filters.round);
    if (filters.category !== "all") params.set("category", filters.category);
    if (filters.sort !== "newest") params.set("sort", filters.sort);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/interviews/history?${query}` : "/interviews/history";
  };

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
        description="查看真实与模拟面试记录，维护面试问题、回答、轮次和状态。"
        title="历史面试"
      />

      <Card className="p-4">
        <form className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_auto] xl:items-end">
            <FieldLabel>
              搜索
              <Input
                defaultValue={filters.q}
                name="q"
                placeholder="公司、岗位或问题"
                type="search"
              />
            </FieldLabel>
            <FieldLabel>
              状态
              <Select defaultValue={filters.status} name="status">
                <option value="all">全部状态</option>
                {INTERVIEW_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {INTERVIEW_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel>
              轮次
              <Select defaultValue={filters.round} name="round">
                <option value="all">全部轮次</option>
                {INTERVIEW_ROUNDS.map((round) => (
                  <option key={round} value={round}>
                    {INTERVIEW_ROUND_LABELS[round]}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <Button type="submit">应用筛选</Button>
          </div>
          <details>
            <summary className="w-fit cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">
              更多筛选
            </summary>
            <div className="mt-3 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
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
            </div>
          </details>
          <div className="flex justify-end border-t border-border pt-3">
            <ButtonLink href="/interviews/history" size="sm" variant="ghost">
              清空筛选
            </ButtonLink>
          </div>
        </form>
      </Card>

      <InterviewList
        interviews={interviewPage.interviews}
        resumeProjects={resumeProjects}
        {...list}
      />

      {interviewPage.totalPages > 1 ? (
        <nav
          aria-label="历史面试分页"
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground shadow-card sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            共 {interviewPage.total} 场 · 第 {interviewPage.page} /{" "}
            {interviewPage.totalPages} 页
          </span>
          <PageNumbers
            ariaLabel="历史面试页码"
            hrefForPage={historyHref}
            page={interviewPage.page}
            totalPages={interviewPage.totalPages}
          />
        </nav>
      ) : null}
    </>
  );
}
