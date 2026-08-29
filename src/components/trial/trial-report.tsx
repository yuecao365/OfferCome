"use client";

import { Download, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MockInterviewReport } from "@/lib/mock-interviews/types";
import type { TrialInterview } from "@/lib/trial/interview";

/** 体验版报告：总分、总结、逐题评分与证据。 */
export function TrialReport({
  interview,
  report,
  onRestart,
}: {
  interview: TrialInterview;
  report: MockInterviewReport;
  onRestart: () => void;
}) {
  const sections: { title: string; items: string[] }[] = [
    { title: "做得好的地方", items: report.strengths },
    { title: "可以改进的地方", items: report.improvements },
    { title: "下一步行动", items: report.actionPlan },
  ];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>本场模拟面试报告</CardTitle>
            <CardDescription>
              {interview.job.companyName} · {interview.job.jobTitle}
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">总分</p>
            <p className="text-3xl font-semibold text-foreground">{report.totalScore}</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm leading-7 text-foreground">{report.summary}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </h3>
                <ul className="mt-2 grid gap-1.5">
                  {section.items.length > 0 ? (
                    section.items.map((item, index) => (
                      <li className="text-sm leading-6 text-foreground" key={index}>
                        · {item}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground">—</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>逐题评分</CardTitle>
          <CardDescription>
            每道题按出题时预生成的评分标准打分，跳过的题不计入。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {interview.questions.map((question, index) => {
            const evaluation = interview.evaluations[index];
            const answer = interview.answers[index];
            return (
              <details
                className="overflow-hidden rounded-lg border border-border bg-surface"
                key={index}
              >
                <summary className="cursor-pointer bg-surface-subtle px-4 py-3 text-sm">
                  <span className="font-semibold text-foreground">
                    {index + 1}. {question.question}
                  </span>
                  <span className="ml-2 align-middle">
                    {evaluation ? (
                      <Badge tone={evaluation.score >= 60 ? "success" : "warning"}>
                        {evaluation.score} 分
                      </Badge>
                    ) : (
                      <Badge tone="neutral">已跳过</Badge>
                    )}
                  </span>
                </summary>
                <div className="grid gap-3 px-4 py-3 text-sm">
                  {answer?.trim() ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">你的回答</p>
                      <p className="mt-1 whitespace-pre-wrap leading-6 text-foreground">
                        {answer}
                      </p>
                    </div>
                  ) : null}
                  {evaluation ? (
                    <>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">反馈</p>
                        <p className="mt-1 leading-6 text-foreground">
                          {evaluation.feedback}
                        </p>
                      </div>
                      {evaluation.dimensions.length > 0 ? (
                        <div className="grid gap-1.5">
                          {evaluation.dimensions.map((dimension) => (
                            <div
                              className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5"
                              key={dimension.name}
                            >
                              <span className="text-xs font-medium text-foreground">
                                {dimension.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {dimension.score} · {dimension.evidence}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </details>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            体验版只跑 3 题且不保存记录。本地版可以跑完整场次、导入真实面试、
            自动沉淀能力画像。
          </p>
          <div className="flex gap-2">
            <Button onClick={onRestart} variant="outline">
              <RotateCcw aria-hidden="true" className="size-4" />
              再来一场
            </Button>
            <ButtonLink href="https://github.com/yuecao365/OfferLai">
              <Download aria-hidden="true" className="size-4" />
              获取本地版
            </ButtonLink>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
