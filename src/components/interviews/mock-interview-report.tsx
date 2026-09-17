import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetaText } from "@/components/ui/data-table";
import { cn } from "@/lib/cn";
import { levelLabel } from "@/lib/interview/estimator";
import { AREA_KIND_LABELS, type AreaKind } from "@/lib/mock-interviews/brief/brief";
import type { MockInterviewReport as ReportData } from "@/lib/mock-interviews/report";
import type { MockInterviewView } from "@/lib/mock-interviews/types";

import { QuestionDimensionScores } from "./mock-interview-report-visuals";

/**
 * 报告页：汇总（优点、短板、练什么、简历假设验证）、逐题评分与示范、面试官的笔记；负面反馈都带候选人的原话。
 */

type Question = MockInterviewView["questions"][number];

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

const WEAKNESS_KIND_LABELS: Record<string, string> = { error: "说错了", missing: "没答上", pattern: "反复出现" };
const HYPOTHESIS_STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  confirmed: { label: "已验证", tone: "success" },
  refuted: { label: "没有讲清楚", tone: "warning" },
  open: { label: "没问到", tone: "neutral" },
};

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

function Quote({ text }: { text: string | null }) {
  if (!text) return null;
  return <span className="ml-1 text-xs text-muted-foreground">「{text}」</span>;
}

function Hypotheses({ items }: { items: ReportData["hypotheses"] }) {
  if (items.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-foreground">简历上的说法经不经得起问</h3>
      <div className="mt-3 grid gap-3">
        {items.map((item) => {
          const status = HYPOTHESIS_STATUS[item.status] ?? HYPOTHESIS_STATUS.open;
          return (
            <div className="grid gap-1" key={item.text}>
              <div className="flex flex-wrap items-start gap-2">
                <Badge tone={status.tone}>{status.label}</Badge>
                <p className="text-sm leading-6 text-foreground">{item.text}</p>
              </div>
              {item.verdict ? <p className="pl-1 text-sm leading-6 text-muted-foreground">{item.verdict}</p> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** 面试官最后一份笔记：他对候选人的现场判断，只在报告页展示。 */
/** 事后的能力估计：每项能力答到哪、有多确定；没问到的标出来。 */
function Estimates({ items }: { items: MockInterviewView["estimates"] }) {
  if (items.length === 0) return null;
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold text-foreground">能力估计</h3>
      <ul className="grid gap-2 text-sm leading-6 text-muted-foreground md:grid-cols-2">
        {items.map((item) => (
          <li className="flex flex-wrap items-center gap-2" key={item.competencyId}>
            <span className="text-foreground">{item.name}</span>
            {item.samples === 0 ? (
              <MetaText>没问到</MetaText>
            ) : (
              <>
                <Badge tone={item.mean >= 0.7 ? "success" : item.mean >= 0.4 ? "neutral" : "warning"}>估计 {levelLabel(item.mean)}</Badge>
                <MetaText>
                  置信 {levelLabel(item.confidence)} · {item.samples} 段{item.weight >= 1 ? " · 核心" : ""}
                </MetaText>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Notebook({ session }: { session: MockInterviewView }) {
  const notebook = session.conversation?.notebook?.trim();
  if (!notebook) return null;
  return (
    <details className="rounded-control border border-border p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">面试官的笔记</summary>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{notebook}</p>
    </details>
  );
}

function Teaching({ question }: { question: Question }) {
  const teaching = question.teaching;
  if (!teaching) return null;
  return (
    <details className="mt-3 rounded-control border border-border bg-surface-subtle p-3">
      <summary className="cursor-pointer text-sm font-medium text-foreground">这道题在考察什么</summary>
      <div className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground">
        <div className="flex flex-wrap gap-2">
          {teaching.areaName ? <Badge>{teaching.areaName}</Badge> : null}
          <Badge>{AREA_KIND_LABELS[teaching.sourceKind as AreaKind] ?? teaching.sourceKind}</Badge>
        </div>
        {teaching.competencyOrigin === "baseline" ? (
          <div className="rounded-control border border-border bg-surface p-3">
            <p className="font-medium text-foreground">岗位常见考点</p>
            <p className="mt-1">
              这道题来自这个岗位通常会考的基础题
              {teaching.skillPack ? "（技能包 " + teaching.skillPack + "）" : ""}，不是你提供的岗位描述里写明的。
            </p>
          </div>
        ) : null}
        {teaching.facetsAll.length > 0 ? (
          <div>
            <p className="font-medium text-foreground">追问的角度</p>
            <ul className="mt-1 grid gap-1">
              {teaching.facetsAll.map((facet) => {
                const state = teaching.facetsDone.includes(facet) ? "讲透了" : teaching.facets.includes(facet) ? "问过，没讲透" : "没问到";
                return (
                  <li className="flex flex-wrap items-baseline gap-2" key={facet}>
                    <Badge tone={state === "讲透了" ? "success" : state === "没问到" ? "neutral" : "warning"}>{state}</Badge>
                    <span>{facet}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {teaching.expectedSignals.length > 0 ? (
          <div>
            <p className="font-medium text-foreground">期望信号</p>
            <ul className="mt-1 grid gap-1">
              {teaching.expectedSignals.map((signal) => (
                <li key={signal}>· {signal}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {teaching.note ? (
          <p>
            <span className="font-medium text-foreground">面试官的判断：</span>
            {teaching.note}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function Evaluation({ evaluation }: { evaluation: NonNullable<Question["evaluation"]> }) {
  return (
    <div className="mt-3 grid gap-3">
      {evaluation.lowConfidence ? <Badge tone="neutral">两次评分分歧较大，这段分数仅供参考</Badge> : null}
      <p className="text-sm leading-6 text-muted-foreground">{evaluation.feedback}</p>
      <QuestionDimensionScores dimensions={evaluation.dimensions} />
      {evaluation.strengths.length > 0 || evaluation.weaknesses.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {evaluation.strengths.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">答得好的</p>
              <ul className="mt-1 grid gap-1 text-sm leading-6 text-foreground">
                {evaluation.strengths.map((item) => (
                  <li key={item.point}>
                    · {item.point}
                    <Quote text={item.quote} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {evaluation.weaknesses.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">短板</p>
              <ul className="mt-1 grid gap-1 text-sm leading-6 text-foreground">
                {evaluation.weaknesses.map((item) => (
                  <li key={item.point}>
                    <Badge tone="warning">{WEAKNESS_KIND_LABELS[item.kind] ?? item.kind}</Badge>
                    <span className="ml-1">{item.point}</span>
                    <Quote text={item.quote} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {(evaluation.resumeChecks ?? []).length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">简历核对</p>
          <ul className="mt-1 grid gap-1 text-sm leading-6 text-foreground">
            {(evaluation.resumeChecks ?? []).map((item) => (
              <li key={item.claim}>
                <Badge tone={item.consistent ? "neutral" : "warning"}>{item.consistent ? "与简历一致" : "与简历不一致"}</Badge>
                <span className="ml-1">回答说「{item.claim}」，简历写的是「{item.resumeSays}」</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {evaluation.advice.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">练什么</p>
          <ul className="mt-1 grid gap-1 text-sm leading-6 text-muted-foreground">
            {evaluation.advice.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {evaluation.exemplar ? (
        <details className="rounded-control border border-border bg-surface-subtle p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">用你的项目，这段可以这样答</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{evaluation.exemplar.exemplar}</p>
          {evaluation.exemplar.degraded ? (
            <p className="mt-2 text-xs text-muted-foreground">示范里省略了无法在你的简历或回答中核实的数字。</p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

export function MockInterviewReport({ session }: { session: MockInterviewView }) {
  const report = session.report;
  if (!report) return null;

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
          <p className="mt-2 whitespace-pre-wrap text-[0.8125rem] leading-6 text-muted-foreground">{report.summary}</p>
          {session.business?.product || session.business?.systems.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              按这个团队的业务出题：{session.business.product ?? "（岗位描述没写产品）"}
              {session.business.systems.length > 0 ? `；核心链路：${session.business.systems.join("、")}` : ""}
            </p>
          ) : null}
          <ButtonLink className="mt-3" href="/interviews/profile" size="sm" variant="outline">
            查看能力画像
          </ButtonLink>
        </div>
      </section>
      <Hypotheses items={report.hypotheses} />
      <Estimates items={session.estimates} />

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground">站得住的</h3>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
            {report.strengths.length === 0 ? <li>这场还没有能确认的强项。</li> : null}
            {report.strengths.map((item) => (
              <li key={item.point}>
                · {item.point}
                {item.areaName ? <MetaText className="ml-1">{item.areaName}</MetaText> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground">失守在哪</h3>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
            {report.weaknesses.length === 0 ? <li>没有明显短板。</li> : null}
            {report.weaknesses.map((item) => (
              <li key={item.point}>
                <Badge tone="warning">{WEAKNESS_KIND_LABELS[item.kind] ?? item.kind}</Badge>
                <span className="ml-1">{item.point}</span>
                {item.areaName ? <MetaText className="ml-1">{item.areaName}</MetaText> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground">下一步练什么</h3>
          <ol className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
            {report.advice.map((item, index) => (
              <li key={item}>
                {index + 1}. {item}
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section className="grid gap-3">
        <h3 className="text-sm font-semibold text-foreground">逐段反馈</h3>
        {session.questions.map((question, index) => (
            <Card className="p-4" key={question.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <MetaText>第 {index + 1} 段</MetaText>
                  <h4 className="mt-1 whitespace-pre-wrap text-sm font-medium text-foreground">{question.question}</h4>
                </div>
                <div className="flex items-center gap-3">
                  {question.teaching?.answerSeconds ? <MetaText>作答约 {formatSeconds(question.teaching.answerSeconds)}</MetaText> : null}
                  {question.skipped ? <Badge tone="warning">{question.teaching?.verdict === "failed" ? "没答上" : "已跳过"}</Badge> : question.evaluation ? <Score value={question.evaluation.score ?? 0} /> : <Badge tone="neutral">评分失败，不计入总分</Badge>}
                </div>
              </div>
              {!question.skipped || question.answer ? (
                <details className="mt-3 rounded-control border border-border bg-surface-subtle p-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">查看我的回答</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{question.answer}</p>
                </details>
              ) : null}
              <Teaching question={question} />
              {!question.skipped && question.evaluation ? <Evaluation evaluation={question.evaluation} /> : null}
            </Card>
          ))}
      </section>

      <Notebook session={session} />
    </div>
  );
}
