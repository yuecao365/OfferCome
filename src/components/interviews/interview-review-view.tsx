"use client";

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
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import {
  INTERVIEW_REVIEW_SOURCE_LABELS_I18N,
  INTERVIEW_REVIEW_PAGE_SIZE,
  projectIndexLabel,
  reviewHref,
  type InterviewReviewFilters,
  type InterviewReviewPageData,
  type InterviewReviewQuestionCategory,
  type InterviewReviewSourceFilter,
} from "@/lib/interviews/review";

const messages = defineMessages({
  "zh-CN": {
    categories: { technical: "技术题", general: "通用问题" } as Record<InterviewReviewQuestionCategory, string>,
    unlinked: "未关联实习/项目问题",
    title: "面试复盘",
    projects: "实习/项目",
    questionBank: "通用问题库",
    sourceAria: "复盘来源",
    projectHint: (size: number) => `按相同问题聚合历史回答，每页最多 ${size} 个问题。`,
    questionCount: (n: number) => `${n} 个问题`,
    projectEmpty: "这个实习/项目还没有记录过面试问题。",
    chooseProject: "请选择左侧某个实习或项目，右侧会集中展示相关问题和历史回答。",
    bankHint: "选择分类后，按相同问题聚合不同面试中的回答。",
    backToOverview: "返回概览",
    categoryAria: "问题分类",
    categoryHint: (size: number) => `每页最多显示 ${size} 个聚合问题。`,
    categoryEmpty: "这个分类下还没有问题。",
    chooseCategory: (technical: string, general: string) => `请选择“${technical}”或“${general}”，这里会展示对应的历史回答。`,
  },
  en: {
    categories: { technical: "Technical", general: "General" },
    unlinked: "Questions not linked to an internship / project",
    title: "Interview review",
    projects: "Internships / projects",
    questionBank: "General question bank",
    sourceAria: "Review source",
    projectHint: (size: number) => `Past answers grouped by question, up to ${size} questions per page.`,
    questionCount: (n: number) => `${n} question${n === 1 ? "" : "s"}`,
    projectEmpty: "No interview questions recorded for this internship / project yet.",
    chooseProject: "Pick an internship or project on the left to see its questions and past answers here.",
    bankHint: "Pick a category to see answers from different interviews grouped by question.",
    backToOverview: "Back to overview",
    categoryAria: "Question category",
    categoryHint: (size: number) => `Up to ${size} grouped questions per page.`,
    categoryEmpty: "No questions in this category yet.",
    chooseCategory: (technical: string, general: string) => `Choose "${technical}" or "${general}" to see the matching past answers.`,
  },
});

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
  const locale = useLocale();
  const t = useMessages(messages);
  const projectOptions = data.projects.map((project) => ({
    id: project.id,
    label: projectIndexLabel(project),
  }));
  const projectQuestionCount =
    data.projects.reduce((sum, project) => sum + project.questionCount, 0) +
    data.unlinkedProjectQuestionCount;
  const selectedProjectTitle =
    filters.projectId === "unlinked"
      ? t.unlinked
      : data.selectedProject
        ? projectIndexLabel(data.selectedProject)
        : null;

  return (
    <>
      <PageHeader
        title={t.title}
      />

      <section className="grid gap-2 md:grid-cols-2">
        <ReviewScopeCard
          count={projectQuestionCount}
          href={reviewHref({ section: "projects", source: filters.source })}
          isActive={filters.section === "projects"}
          title={t.projects}
        />
        <ReviewScopeCard
          count={data.technicalQuestionCount + data.generalQuestionCount}
          href={reviewHref({ section: "question_bank", source: filters.source })}
          isActive={filters.section === "question_bank"}
          title={t.questionBank}
        />
      </section>

      <SegmentedLinks
        ariaLabel={t.sourceAria}
        className="self-start"
        items={(Object.keys(INTERVIEW_REVIEW_SOURCE_LABELS_I18N[locale]) as InterviewReviewSourceFilter[]).map(
          (source) => ({
            href: reviewHref({
              section: filters.section,
              projectId: filters.projectId,
              category: filters.category,
              source,
            }),
            label: INTERVIEW_REVIEW_SOURCE_LABELS_I18N[locale][source],
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
                        {t.projectHint(INTERVIEW_REVIEW_PAGE_SIZE)}
                      </p>
                    </div>
                    <MetaText>{t.questionCount(data.questionsPage.total)}</MetaText>
                  </CardHeader>
                </Card>
                <QuestionReviewList
                  reclassifyAction={reclassifyAction}
                  empty={t.projectEmpty}
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
                  {t.chooseProject}
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
                <CardTitle>{t.questionBank}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{t.bankHint}</p>
              </div>
              <Link className="text-xs text-muted-foreground hover:text-foreground" href={reviewHref({ section: "overview", source: filters.source })}>
                {t.backToOverview}
              </Link>
            </CardHeader>
            <CardContent className="py-4">
              <SegmentedLinks
                ariaLabel={t.categoryAria}
                items={(["technical", "general"] as const).map((category) => ({
                  href: reviewHref({ section: "question_bank", category, source: filters.source }),
                  label: `${t.categories[category]} · ${
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
                  <h2 className="text-sm font-semibold text-foreground">{t.categories[filters.category]}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t.categoryHint(INTERVIEW_REVIEW_PAGE_SIZE)}</p>
                </div>
                <MetaText>{t.questionCount(data.questionsPage.total)}</MetaText>
              </div>
              <QuestionReviewList
                reclassifyAction={reclassifyAction}
                empty={t.categoryEmpty}
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
                {t.chooseCategory(t.categories.technical, t.categories.general)}
              </CardContent>
            </Card>
          )}
        </section>
      ) : null}
        </>
  );
}
