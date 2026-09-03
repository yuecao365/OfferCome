import Link from "next/link";
import type { ComponentProps } from "react";

import {
  InterviewReviewOverview,
  QuestionReviewList,
  ReviewPagination,
  ReviewScopeCard,
} from "@/components/interviews/interview-review-components";
import { ReviewProjectIndex } from "@/components/interviews/review-project-index";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetaText } from "@/components/ui/data-table";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import {
  INTERVIEW_REVIEW_SOURCE_LABELS,
  INTERVIEW_REVIEW_PAGE_SIZE,
  projectIndexLabel,
  reviewHref,
  type InterviewReviewFilters,
  type InterviewReviewPageData,
  type InterviewReviewQuestionCategory,
  type InterviewReviewSourceFilter,
} from "@/lib/interviews/review";

const QUESTION_CATEGORY_LABELS: Record<InterviewReviewQuestionCategory, string> = {
  technical: "技术八股",
  general: "通用问题",
};

/**
 * 面试复盘页的呈现层。本地版（服务端取数）和体验版（浏览器取数）
 * 渲染同一个组件；归类动作可注入浏览器实现。
 */
export function InterviewReviewView({
  filters,
  data,
  reclassifyAction,
}: {
  filters: InterviewReviewFilters;
  data: InterviewReviewPageData;
  reclassifyAction?: ComponentProps<typeof QuestionReviewList>["reclassifyAction"];
}) {
  const projectOptions = data.projects.map((project) => ({
    id: project.id,
    label: projectIndexLabel(project),
  }));
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
    <>
      <PageHeader
        description="先选择复盘范围，再聚焦查看某个项目、技术问题或通用问题的历史回答。"
        title="面试复盘"
      />

      <section className="grid gap-2 md:grid-cols-2">
        <ReviewScopeCard
          count={projectQuestionCount}
          description="按单个实习或项目查看关联问题，避免所有项目问题混在一起。"
          href={reviewHref({ section: "projects", source: filters.source })}
          isActive={filters.section === "projects"}
          title="实习/项目"
        />
        <ReviewScopeCard
          count={data.technicalQuestionCount + data.generalQuestionCount}
          description="查看技术八股或通用问题，按问题聚合历史回答。"
          href={reviewHref({ section: "question_bank", source: filters.source })}
          isActive={filters.section === "question_bank"}
          title="通用问题库"
        />
      </section>

      <SegmentedLinks
        ariaLabel="复盘来源"
        className="self-start"
        items={(Object.keys(INTERVIEW_REVIEW_SOURCE_LABELS) as InterviewReviewSourceFilter[]).map(
          (source) => ({
            href: reviewHref({
              section: filters.section,
              projectId: filters.projectId,
              category: filters.category,
              source,
            }),
            label: INTERVIEW_REVIEW_SOURCE_LABELS[source],
            active: filters.source === source,
          }),
        )}
      />

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
          <ReviewProjectIndex
            activeProjectId={filters.projectId}
            projects={data.projects}
            source={filters.source}
            unlinkedQuestionCount={data.unlinkedProjectQuestionCount}
          />

          <div className="min-w-0 grid gap-3">
            {selectedProjectTitle ? (
              <>
                <Card>
                  <CardHeader className="flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle>{selectedProjectTitle}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        按相同问题聚合历史回答，每页最多 {INTERVIEW_REVIEW_PAGE_SIZE} 个问题。
                      </p>
                    </div>
                    <MetaText>{data.questionsPage.total} 个问题</MetaText>
                  </CardHeader>
                </Card>
                <QuestionReviewList
                  reclassifyAction={reclassifyAction}
                  empty="这个实习/项目还没有记录过面试问题。"
                  items={data.questionsPage.items}
                  reclassifyProjects={projectOptions}
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
              <Link className="text-xs text-muted-foreground hover:text-foreground" href={reviewHref({ section: "overview", source: filters.source })}>
                返回概览
              </Link>
            </CardHeader>
            <CardContent className="py-4">
              <SegmentedLinks
                ariaLabel="问题分类"
                items={(["technical", "general"] as const).map((category) => ({
                  href: reviewHref({ section: "question_bank", category, source: filters.source }),
                  label: `${QUESTION_CATEGORY_LABELS[category]} · ${
                    category === "technical" ? data.technicalQuestionCount : data.generalQuestionCount
                  }`,
                  active: filters.category === category,
                }))}
              />
            </CardContent>
          </Card>

          {filters.category ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{QUESTION_CATEGORY_LABELS[filters.category]}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">每页最多显示 {INTERVIEW_REVIEW_PAGE_SIZE} 个聚合问题。</p>
                </div>
                <MetaText>{data.questionsPage.total} 个问题</MetaText>
              </div>
              <QuestionReviewList
                reclassifyAction={reclassifyAction}
                empty="这个分类下还没有问题。"
                items={data.questionsPage.items}
                reclassifyProjects={projectOptions}
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
        </>
  );
}
