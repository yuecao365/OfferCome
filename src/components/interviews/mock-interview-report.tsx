import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetaText } from "@/components/ui/data-table";
import { cn } from "@/lib/cn";
import {
  MOCK_INTERVIEW_DIFFICULTY_LABELS,
  type MockInterviewView,
} from "@/lib/mock-interviews/types";

import { QuestionDimensionScores } from "./mock-interview-report-visuals";

/** 分数只用明暗表达强弱：高分正文色，中分灰，低分用警示色。 */
function Score({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-sm tabular-nums",
        value >= 80 ? "text-foreground" : value >= 50 ? "text-muted-foreground" : "text-warning-strong",
      )}
    >
      {value}
      <span className="ml-0.5 text-xs text-muted-foreground">分</span>
    </span>
  );
}

function FollowUpTag() {
  return (
    <span className="rounded-control border border-border px-1 font-mono text-[0.625rem] leading-4 text-muted-foreground">
      追问
    </span>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  job_description: "岗位描述",
  resume: "简历经历",
  history: "历史回答",
  profile: "能力画像",
  general_role: "通用岗位题",
};

export function MockInterviewReport({ session }: { session: MockInterviewView }) {
  const report = session.report;
  if (!report) return null;
  // 生成来源透明卡：让用户知道多少题直连 JD、多少题是按岗位常见要求补全的。
  const sourced = session.questions.filter(
    (question) => !question.isFollowUp && question.teaching,
  );
  const generalRoleCount = sourced.filter(
    (question) => question.teaching?.sourceKind === "general_role",
  ).length;

  return (
    <div className="reveal-group grid gap-6">
      <section className="grid gap-6 border-b border-border pb-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-10">
        <div>
          <p className="text-[0.8125rem] text-muted-foreground">面试总分</p>
          <p className="mt-1 text-display tabular-nums text-foreground">
            {report.totalScore}
            <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">/ 100</span>
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">总体评价</h3>
          <p className="mt-2 whitespace-pre-wrap text-[0.8125rem] leading-6 text-muted-foreground">
            {report.summary}
          </p>
          {sourced.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              本场 {sourced.length} 题：{sourced.length - generalRoleCount} 题来自岗位描述与你的材料
              {generalRoleCount > 0 ? `，${generalRoleCount} 题按岗位常见要求补全` : ""}。
            </p>
          ) : null}
        </div>
      </section>

      {session.personalizationUsed ? (
        <Card className="grid gap-5 p-5 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">出题参考</h3>
            {session.personalizationUsed.profileInsights.length === 0 &&
            session.personalizationUsed.historyQuestions.length === 0 ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                本场仅根据岗位描述出题。
              </p>
            ) : (
              <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                {session.personalizationUsed.profileInsights.map((insight) => (
                  <div className="flex items-start gap-2" key={insight.id}>
                    <Badge>画像</Badge>
                    <span>{insight.title}</span>
                  </div>
                ))}
                {session.personalizationUsed.historyQuestions.map((question) => (
                  <div className="flex items-start gap-2" key={question.id}>
                    <Badge>历史回答</Badge>
                    <span>
                      {question.question} · {question.companyName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">画像贡献</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {session.profileContributionCount === null
                ? "画像正在吸收本场证据…"
                : `本场为能力画像新增 ${session.profileContributionCount} 条证据。`}
            </p>
            <ButtonLink
              className="mt-3"
              href="/interviews/profile"
              size="sm"
              variant="outline"
            >
              查看能力画像
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground">表现较好的部分</h3>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
            {report.strengths.map((item) => <li key={item}>· {item}</li>)}
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground">优先改进</h3>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
            {report.improvements.map((item) => <li key={item}>· {item}</li>)}
          </ul>
        </Card>
      </section>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground">下一步训练计划</h3>
        <ol className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
          {report.actionPlan.map((item, index) => (
            <li key={item}>{index + 1}. {item}</li>
          ))}
        </ol>
      </Card>

      <section className="grid gap-3">
        <h3 className="text-sm font-semibold text-foreground">逐题反馈</h3>
        {session.questions.filter((question) => !question.isFollowUp).map((question, index) => (
          <Card className="p-4" key={question.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <MetaText>问题 {index + 1}</MetaText>
                <div className="mt-1 flex items-center gap-2">
                  {question.isFollowUp ? <FollowUpTag /> : null}
                  <h4 className="text-sm font-medium text-foreground">{question.question}</h4>
                </div>
              </div>
              {question.skipped ? (
                <Badge tone="warning">已跳过</Badge>
              ) : (
                <Score value={question.evaluation?.score ?? 0} />
              )}
            </div>
            {!question.skipped ? (
              <details className="mt-3 rounded-control border border-border bg-surface-subtle p-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">查看我的回答</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{question.answer}</p>
              </details>
            ) : null}
            {question.teaching ? (
              <details className="mt-3 rounded-control border border-border bg-surface-subtle p-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  这道题在考察什么
                </summary>
                <div className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground">
                  <div className="flex flex-wrap gap-2">
                    {question.teaching.competencyName ? (
                      <Badge>{question.teaching.competencyName}</Badge>
                    ) : null}
                    <Badge>{SOURCE_LABELS[question.teaching.sourceKind] ?? "综合出题"}</Badge>
                    <Badge>
                      {MOCK_INTERVIEW_DIFFICULTY_LABELS[
                        question.teaching.difficulty as keyof typeof MOCK_INTERVIEW_DIFFICULTY_LABELS
                      ] ?? question.teaching.difficulty}
                    </Badge>
                  </div>
                  {question.teaching.competencyOrigin === "inferred" ? (
                    <div className="rounded-control border border-border bg-surface p-3">
                      <p className="font-medium text-foreground">
                        该岗位的常见要求（非你提供的岗位描述）
                      </p>
                      <p className="mt-1">
                        这道题基于该岗位的常见要求，不是你提供的岗位描述。
                      </p>
                      {question.teaching.sourceUrl ? (
                        <a
                          className="mt-1 inline-block font-medium text-foreground underline"
                          href={question.teaching.sourceUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          查看公开来源
                        </a>
                      ) : null}
                    </div>
                  ) : question.teaching.jdEvidence ? (
                    <blockquote className="border-l-2 border-border-strong pl-3">
                      JD 依据：{question.teaching.jdEvidence}
                    </blockquote>
                  ) : null}
                  {question.teaching.expectedSignals.length > 0 ? (
                    <div>
                      <p className="font-medium text-foreground">期望信号</p>
                      <ul className="mt-1 grid gap-1">
                        {question.teaching.expectedSignals.map((signal) => (
                          <li key={signal}>· {signal}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {question.teaching.rationale ? (
                    <p>
                      <span className="font-medium text-foreground">出题理由：</span>
                      {question.teaching.rationale}
                    </p>
                  ) : null}
                </div>
              </details>
            ) : null}
            {!question.skipped && question.evaluation ? (
              <div className="mt-3 grid gap-3">
                <p className="text-sm leading-6 text-muted-foreground">{question.evaluation.feedback}</p>
                <QuestionDimensionScores dimensions={question.evaluation.dimensions} />
              </div>
            ) : null}
            {session.questions
              .filter((followUp) => followUp.parentQuestionId === question.id)
              .map((followUp) => (
                <div className="mt-4 border-l-2 border-border-strong pl-4" key={followUp.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FollowUpTag />
                      <h5 className="text-sm font-medium text-foreground">{followUp.question}</h5>
                    </div>
                    {followUp.skipped ? (
                      <Badge tone="warning">已跳过</Badge>
                    ) : (
                      <Score value={followUp.evaluation?.score ?? 0} />
                    )}
                  </div>
                  {!followUp.skipped ? (
                    <>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{followUp.answer}</p>
                      {followUp.evaluation ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{followUp.evaluation.feedback}</p> : null}
                    </>
                  ) : null}
                </div>
              ))}
          </Card>
        ))}
      </section>
    </div>
  );
}
