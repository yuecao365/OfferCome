import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  MOCK_INTERVIEW_DIFFICULTY_LABELS,
  type MockInterviewView,
} from "@/lib/mock-interviews/types";

const SOURCE_LABELS: Record<string, string> = {
  job_description: "岗位描述",
  resume: "简历经历",
  history: "历史回答",
  profile: "能力画像",
};

export function MockInterviewReport({ session }: { session: MockInterviewView }) {
  const report = session.report;
  if (!report) return null;

  return (
    <div className="grid gap-6">
      <Card className="grid gap-4 p-5 md:grid-cols-[140px_minmax(0,1fr)]">
        <div>
          <p className="text-sm font-medium text-muted-foreground">面试总分</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground">
            {report.totalScore}
            <span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span>
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">总体评价</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {report.summary}
          </p>
        </div>
      </Card>

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
        <h3 className="text-base font-semibold text-foreground">逐题反馈</h3>
        {session.questions.map((question, index) => (
          <Card className="p-4" key={question.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">问题 {index + 1}</p>
                <h4 className="mt-1 text-sm font-semibold text-foreground">{question.question}</h4>
              </div>
              <Badge tone="brand">{question.evaluation?.score ?? 0} 分</Badge>
            </div>
            <details className="mt-3 rounded-lg border border-border bg-surface-subtle p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">查看我的回答</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{question.answer}</p>
            </details>
            {question.teaching ? (
              <details className="mt-3 rounded-lg border border-border bg-surface-subtle p-3">
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
                  {question.teaching.jdEvidence ? (
                    <blockquote className="border-l-2 border-brand pl-3 italic">
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
            {question.evaluation ? (
              <div className="mt-3 grid gap-3">
                <p className="text-sm leading-6 text-muted-foreground">{question.evaluation.feedback}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {question.evaluation.dimensions.map((dimension) => (
                    <div className="rounded-lg border border-border p-3" key={dimension.name}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-foreground">{dimension.name}</span>
                        <span className="text-muted-foreground">{Math.round(dimension.score)} 分</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{dimension.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </section>
    </div>
  );
}
