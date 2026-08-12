import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { InterviewList } from "@/components/interviews/interview-list";
import { NewInterviewModal } from "@/components/interviews/interview-modals";
import { PageHeader } from "@/components/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input, Select } from "@/components/ui/form-controls";
import {
  getInterviews,
  getResumeProjectOptions,
} from "@/lib/interviews/queries";
import {
  INTERVIEW_QUESTION_CATEGORIES,
  INTERVIEW_QUESTION_CATEGORY_LABELS,
  INTERVIEW_ROUND_LABELS,
  INTERVIEW_ROUNDS,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUSES,
  parseInterviewFilters,
} from "@/lib/interviews/types";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

export default async function InterviewHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const filters = parseInterviewFilters(await searchParams);
  const [interviews, resumeProjects, transcriptionConfig] = await Promise.all([
    getInterviews(filters),
    getResumeProjectOptions(),
    getAiTaskConfig("transcription"),
  ]);

  return (
    <AppShell active="interviews" subActive="interviews-history">
      <PageHeader
        actions={<NewInterviewModal resumeProjects={resumeProjects} transcriptionConfigured={isAiTaskConfigured(transcriptionConfig)} />}
        description="查看真实与模拟面试记录，维护面试问题、回答、轮次和状态。"
        eyebrow="面试训练"
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
            <Select
              defaultValue={filters.status}
              name="status"
            >
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
            <Select
              defaultValue={filters.round}
              name="round"
            >
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
            <summary className="w-fit cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">更多筛选</summary>
            <div className="mt-3 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <FieldLabel>
            问题类型
            <Select
              defaultValue={filters.category}
              name="category"
            >
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
            <Select
              defaultValue={filters.sort}
              name="sort"
            >
              <option value="newest">最新在前</option>
              <option value="oldest">最早在前</option>
            </Select>
              </FieldLabel>
            </div>
          </details>
          <div className="flex justify-end border-t border-border pt-3">
            <ButtonLink href="/interviews/history" size="sm" variant="ghost">清空筛选</ButtonLink>
          </div>
        </form>
      </Card>

      <InterviewList interviews={interviews} resumeProjects={resumeProjects} />
    </AppShell>
  );
}
