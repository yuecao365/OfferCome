import { FolderKanban, LibraryBig } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import {
  InterviewReviewOverview,
  QuestionReviewList,
  ReviewPagination,
  ReviewScopeCard,
} from "@/components/interviews/interview-review-components";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { getInterviewReviewPageData } from "@/lib/interviews/queries";
import {
  INTERVIEW_REVIEW_SOURCE_LABELS,
  INTERVIEW_REVIEW_PAGE_SIZE,
  parseInterviewReviewFilters,
  type InterviewReviewQuestionCategory,
  type InterviewReviewSection,
  type InterviewReviewSourceFilter,
} from "@/lib/interviews/review";

const QUESTION_CATEGORY_LABELS: Record<InterviewReviewQuestionCategory, string> = {
  technical: "技术八股",
  general: "通用问题",
};

function reviewHref(options: {
  section?: InterviewReviewSection;
  projectId?: string | null;
  category?: InterviewReviewQuestionCategory | null;
  source?: InterviewReviewSourceFilter;
  page?: number;
}): string {
  const params = new URLSearchParams();
  const section = options.section ?? "overview";

  if (section !== "overview") {
    params.set("section", section);
  }
  if (options.projectId) {
    params.set("projectId", options.projectId);
  }
  if (options.category) {
    params.set("category", options.category);
  }
  if (options.source && options.source !== "all") {
    params.set("source", options.source);
  }
  if (options.page && options.page > 1) {
    params.set("page", String(options.page));
  }

  const query = params.toString();
  return query ? `/interviews/review?${query}` : "/interviews/review";
}

function projectIndexLabel(project: {
  name: string;
  type: string;
  organization: string;
}): string {
  return project.type === "internship" && project.organization
    ? project.organization
    : project.name;
}

export default async function InterviewReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const filters = parseInterviewReviewFilters(await searchParams);
  const data = await getInterviewReviewPageData(filters);
  const projectQuestionCount =
    data.projects.reduce((sum, project) => sum + project.questionCount, 0) +
    data.unlinkedProjectQuestionCount;
  const selectedProjectTitle =
    filters.projectId === "unlinked"
      ? "未关联实习/项目问题"
      : data.selectedProject
        ? projectIndexLabel(data.selectedProject)
        : null;

  return (
    <AppShell active="interviews" subActive="interviews-review">
      <PageHeader
        description="先选择复盘范围，再聚焦查看某个项目、技术问题或通用问题的历史回答。"
        eyebrow="面试训练"
        title="面试复盘"
      />

      <section className="grid gap-3 md:grid-cols-2">
        <ReviewScopeCard
          count={projectQuestionCount}
          description="按单个实习或项目查看关联问题，避免所有项目问题混在一起。"
          href={reviewHref({ section: "projects", source: filters.source })}
          icon={<FolderKanban aria-hidden="true" className="size-5" />}
          isActive={filters.section === "projects"}
          title="实习/项目"
        />
        <ReviewScopeCard
          count={data.technicalQuestionCount + data.generalQuestionCount}
          description="查看技术八股或通用问题，按问题聚合历史回答。"
          href={reviewHref({ section: "question_bank", source: filters.source })}
          icon={<LibraryBig aria-hidden="true" className="size-5" />}
          isActive={filters.section === "question_bank"}
          title="通用问题库"
        />
      </section>

      <nav aria-label="复盘来源" className="flex flex-wrap items-center gap-2">
        {(Object.keys(INTERVIEW_REVIEW_SOURCE_LABELS) as InterviewReviewSourceFilter[]).map(
          (source) => {
            const isActive = filters.source === source;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-brand/30 hover:bg-surface-subtle hover:text-foreground",
                  isActive &&
                    "border-brand bg-brand text-brand-foreground hover:bg-brand-hover hover:text-brand-foreground",
                )}
                href={reviewHref({
                  section: filters.section,
                  projectId: filters.projectId,
                  category: filters.category,
                  source,
                })}
                key={source}
              >
                {INTERVIEW_REVIEW_SOURCE_LABELS[source]}
              </Link>
            );
          },
        )}
      </nav>

      {filters.section === "overview" ? (
        <InterviewReviewOverview
          generalQuestionCount={data.generalQuestionCount}
          projectCount={data.projects.length}
          projectQuestionCount={projectQuestionCount}
          technicalQuestionCount={data.technicalQuestionCount}
        />
      ) : null}

      {filters.section === "projects" ? (
        <section className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Card className="min-w-0 overflow-hidden xl:sticky xl:top-20">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>实习/项目索引</CardTitle>
              <Link className="text-xs font-semibold text-brand hover:text-brand-hover" href={reviewHref({ section: "overview", source: filters.source })}>
                返回概览
              </Link>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-2 overflow-hidden">
              {data.projects.length === 0 ? (
                <p className="rounded-lg bg-surface-subtle p-3 text-sm leading-6 text-muted-foreground">
                  还没有从简历中识别到实习/项目。你仍然可以查看未关联问题。
                </p>
              ) : null}
              {data.projects.map((project) => {
                const isActive = filters.projectId === project.id;
                const label = projectIndexLabel(project);
                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:border-brand/30 hover:bg-surface-subtle",
                      isActive && "border-brand/35 bg-accent/60",
                    )}
                    href={reviewHref({
                      section: "projects",
                      projectId: project.id,
                      source: filters.source,
                    })}
                    key={project.id}
                    title={label}
                  >
                    <span className="block min-w-0 flex-1 truncate font-medium text-foreground">
                      {label}
                    </span>
                    <Badge className="shrink-0" tone={project.questionCount > 0 ? "brand" : "neutral"}>{project.questionCount}</Badge>
                  </Link>
                );
              })}
              <Link
                aria-current={filters.projectId === "unlinked" ? "page" : undefined}
                className={cn(
                  "flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:border-brand/30 hover:bg-surface-subtle",
                  filters.projectId === "unlinked" && "border-brand/35 bg-accent/60",
                )}
                href={reviewHref({
                  section: "projects",
                  projectId: "unlinked",
                  source: filters.source,
                })}
              >
                <span className="block min-w-0 flex-1 truncate font-medium text-foreground">未关联项目</span>
                <Badge className="shrink-0" tone={data.unlinkedProjectQuestionCount > 0 ? "brand" : "neutral"}>
                  {data.unlinkedProjectQuestionCount}
                </Badge>
              </Link>
            </CardContent>
          </Card>

          <div className="min-w-0 grid gap-3">
            {selectedProjectTitle ? (
              <>
                <Card>
                  <CardHeader className="flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">{selectedProjectTitle}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        按相同问题聚合历史回答，每页最多 {INTERVIEW_REVIEW_PAGE_SIZE} 个问题。
                      </p>
                    </div>
                    <Badge tone="brand">{data.questionsPage.total} 个问题</Badge>
                  </CardHeader>
                </Card>
                <QuestionReviewList
                  empty="这个实习/项目还没有记录过面试问题。"
                  items={data.questionsPage.items}
                />
                <ReviewPagination
                  hrefForPage={(page) =>
                    reviewHref({
                      section: "projects",
                      projectId: filters.projectId,
                      source: filters.source,
                      page,
                    })
                  }
                  page={data.questionsPage}
                />
              </>
            ) : (
              <Card>
                <CardContent className="flex min-h-48 items-center justify-center text-center text-sm text-muted-foreground">
                  请选择左侧某个实习或项目，右侧会集中展示相关问题和历史回答。
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      ) : null}

      {filters.section === "question_bank" ? (
        <section className="grid gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>通用问题库</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">选择分类后，按相同问题聚合不同面试中的回答。</p>
              </div>
              <Link className="text-xs font-semibold text-brand hover:text-brand-hover" href={reviewHref({ section: "overview", source: filters.source })}>
                返回概览
              </Link>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(["technical", "general"] as const).map((category) => {
                const isActive = filters.category === category;
                const count =
                  category === "technical"
                    ? data.technicalQuestionCount
                    : data.generalQuestionCount;
                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-brand/30 hover:bg-surface-subtle hover:text-foreground",
                      isActive && "border-brand bg-brand text-brand-foreground hover:bg-brand-hover hover:text-brand-foreground",
                    )}
                    href={reviewHref({
                      section: "question_bank",
                      category,
                      source: filters.source,
                    })}
                    key={category}
                  >
                    {QUESTION_CATEGORY_LABELS[category]} · {count} 条记录
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          {filters.category ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{QUESTION_CATEGORY_LABELS[filters.category]}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">每页最多显示 {INTERVIEW_REVIEW_PAGE_SIZE} 个聚合问题。</p>
                </div>
                <Badge tone="brand">{data.questionsPage.total} 个问题</Badge>
              </div>
              <QuestionReviewList
                empty="这个分类下还没有问题。"
                items={data.questionsPage.items}
              />
              <ReviewPagination
                hrefForPage={(page) =>
                  reviewHref({
                    section: "question_bank",
                    category: filters.category,
                    source: filters.source,
                    page,
                  })
                }
                page={data.questionsPage}
              />
            </div>
          ) : (
            <Card>
              <CardContent className="flex min-h-40 items-center justify-center text-center text-sm text-muted-foreground">
                请选择“技术八股”或“通用问题”，这里会展示对应的历史回答。
              </CardContent>
            </Card>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}
