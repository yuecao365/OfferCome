import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetaText } from "@/components/ui/data-table";
import { cn } from "@/lib/cn";
import { levelLabel } from "@/lib/interview/estimator";
import { AREA_KIND_LABELS, KIND_WEIGHT, type AreaKind } from "@/lib/mock-interviews/brief/brief";
import type { MockInterviewReport as ReportData } from "@/lib/mock-interviews/report";
import type { MockInterviewView } from "@/lib/mock-interviews/types";

import { InterviewerTrail } from "./interviewer-trail";
import { QuestionDimensionScores } from "./mock-interview-report-visuals";

/**
 * 报告页，从上到下：总分与两句总评 → 失守与练法（最多 3 条）→ 站得住的（一行）→ 简历上的说法（只列判过的）→ 能力估计（一行）→ 面试官思路 → 逐段（默认折叠）。
 * 首屏只放主要判断，细节都折叠在逐段里；开发者记录只留页尾一个链接。本地版与体验版共用。
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
/** 首屏只放最要紧的：短板 3 条、站得住的 2 条；其余在逐段反馈里。 */
const MAX_WEAKNESSES = 3;
const MAX_STRENGTHS = 2;
const HYPOTHESIS_STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  confirmed: { label: "已验证", tone: "success" },
  refuted: { label: "没有讲清楚", tone: "warning" },
  open: { label: "没问到", tone: "neutral" },
};

function Quote({ text }: { text: string | null }) {
  if (!text) return null;
  return <span className="ml-1 text-xs text-muted-foreground">「{text}」</span>;
}

/** 总分旁一行：按哪几种材料、什么权重算出来的；跳过或没答上的段记 0 分（与 areaOutcomes 同口径），答了但评分失败的不计。 */
function scoreFormula(questions: Question[]): string {
  const unscored = questions.filter((question) => !question.skipped && (question.evaluation === null || question.evaluation.score === null));
  const zeroed = questions.filter((question) => question.skipped);
  const counted = questions.length - unscored.length;
  const kinds = [...new Set(questions.map((question) => question.segment?.kind).filter((kind): kind is AreaKind => kind === "project" || kind === "quick" || kind === "scenario"))];
  const weights = kinds.map((kind) => `${AREA_KIND_LABELS[kind]} ${KIND_WEIGHT[kind]}`).join(" · ");
  const notes = [zeroed.length > 0 ? `${zeroed.length} 段跳过或没答上，记 0 分` : "", unscored.length > 0 ? `${unscored.length} 段评分失败，不计` : ""].filter(Boolean);
  return `${counted} 段按材料权重加权${weights ? `（${weights}）` : ""}${notes.length > 0 ? `；${notes.join("；")}` : ""}`;
}

function Hypotheses({ items }: { items: ReportData["hypotheses"] }) {
  const judged = items.filter((item) => item.status !== "open");
  if (items.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-foreground">简历上的说法经不经得起问</h3>
      <div className="mt-3 grid gap-3">
        {judged.map((item) => {
          const status = HYPOTHESIS_STATUS[item.status] ?? HYPOTHESIS_STATUS.open;
          return (
            <div className="flex flex-wrap items-start gap-2" key={item.text}>
              <Badge tone={status.tone}>{status.label}</Badge>
              <p className="text-sm leading-6 text-foreground">{item.verdict ?? item.text}</p>
            </div>
          );
        })}
        {judged.length === 0 ? <p className="text-sm leading-6 text-muted-foreground">这场没有问到简历上的说法。</p> : null}
      </div>
    </Card>
  );
}

/** 事后的能力估计：只列测到的，一行一项：名字 + 档位。没测到的不提。 */
function Estimates({ items }: { items: MockInterviewView["estimates"] }) {
  const measured = items.filter((item) => item.samples > 0);
  if (measured.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold text-foreground">能力估计</h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm leading-6 text-muted-foreground">
        {measured.map((item) => (
          <li className="flex items-center gap-1.5" key={item.competencyId}>
            <span className="text-foreground">{item.name}</span>
            <Badge tone={item.mean >= 0.7 ? "success" : item.mean >= 0.4 ? "neutral" : "warning"}>{levelLabel(item.mean)}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Evaluation({ evaluation }: { evaluation: NonNullable<Question["evaluation"]> }) {
  return (
    <div className="mt-3 grid gap-3">
      <QuestionDimensionScores dimensions={evaluation.dimensions} />
      {evaluation.weaknesses.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">短板与练法</p>
          <ul className="mt-1 grid gap-2 text-sm leading-6 text-foreground">
            {evaluation.weaknesses.map((item) => (
              <li key={item.point}>
                <Badge tone="warning">{WEAKNESS_KIND_LABELS[item.kind] ?? item.kind}</Badge>
                <span className="ml-2">{item.point}</span>
                <Quote text={item.quote} />
                {item.practice ? <p className="pl-1 text-muted-foreground">练：{item.practice}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
      {(evaluation.resumeChecks ?? []).length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">简历核对</p>
          <ul className="mt-1 grid gap-1 text-sm leading-6 text-foreground">
            {(evaluation.resumeChecks ?? []).map((item) => (
              <li key={item.claim}>
                <Badge tone={item.consistent ? "neutral" : "warning"}>{item.consistent ? "与简历一致" : "与简历不一致"}</Badge>
                <span className="ml-2">回答说「{item.claim}」，简历写的是「{item.resumeSays}」</span>
              </li>
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

/** 折叠行：段名 · 分数 · 一句结论；展开才有题面、维度、短板、回答与示范。 */
function Segment({ question, index }: { question: Question; index: number }) {
  const evaluation = question.evaluation;
  const label = question.segment?.areaName ?? `第 ${index + 1} 段`;
  const kind = question.segment?.kind;
  const status = question.skipped ? (
    <Badge tone="warning">{question.segment?.verdict === "failed" ? "没答上" : "已跳过"}</Badge>
  ) : evaluation ? (
    <Score value={evaluation.score ?? 0} />
  ) : (
    <Badge tone="neutral">评分失败，不计入总分</Badge>
  );
  return (
    <details className="rounded-control border border-border p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{label}</span>
              {kind && kind in AREA_KIND_LABELS ? <MetaText>{AREA_KIND_LABELS[kind as AreaKind]}</MetaText> : null}
            </div>
            {evaluation?.verdict ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{evaluation.verdict}</p> : null}
          </div>
          {status}
        </div>
      </summary>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{question.question}</p>
      {!question.skipped && evaluation ? <Evaluation evaluation={evaluation} /> : null}
      {question.answer ? (
        <details className="mt-3 rounded-control border border-border bg-surface-subtle p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">我的回答</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{question.answer}</p>
        </details>
      ) : null}
    </details>
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
          <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">{scoreFormula(session.questions)}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">总体评价</h3>
          <p className="mt-2 whitespace-pre-wrap text-[0.8125rem] leading-6 text-muted-foreground">{report.summary}</p>
          <ButtonLink className="mt-3" href="/interviews/profile" size="sm" variant="outline">
            查看能力画像
          </ButtonLink>
        </div>
      </section>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground">失守在哪、练什么</h3>
        <ul className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground">
          {report.weaknesses.length === 0 ? <li>没有明显短板。</li> : null}
          {report.weaknesses.slice(0, MAX_WEAKNESSES).map((item) => (
            <li key={item.point}>
              <div>
                <Badge tone="warning">{WEAKNESS_KIND_LABELS[item.kind] ?? item.kind}</Badge>
                <span className="ml-2 text-foreground">{item.point}</span>
                {item.areaName ? <MetaText className="ml-2">{item.areaName}</MetaText> : null}
              </div>
              {item.practice ? <p className="pl-1">练：{item.practice}</p> : null}
            </li>
          ))}
          {report.weaknesses.length > MAX_WEAKNESSES ? <li className="text-xs">其余 {report.weaknesses.length - MAX_WEAKNESSES} 条在逐段反馈里。</li> : null}
        </ul>
      </Card>

      {report.strengths.length > 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          <span className="font-semibold text-foreground">站得住的：</span>
          {report.strengths
            .slice(0, MAX_STRENGTHS)
            .map((item) => item.point)
            .join("；")}
        </p>
      ) : null}

      <Hypotheses items={report.hypotheses} />
      <Estimates items={session.estimates} />
      {session.trail ? <InterviewerTrail trail={session.trail} /> : null}

      <section className="grid gap-3">
        <h3 className="text-sm font-semibold text-foreground">逐段反馈</h3>
        {session.questions.map((question, index) => (
          <Segment index={index} key={question.id} question={question} />
        ))}
      </section>

      <p className="text-xs text-muted-foreground">
        开发者视角（每回合的模型调用、工具、开销）：
        <Link className="ml-1 underline-offset-4 hover:underline" href={`/interviews/mock/${session.id}/trace`}>
          开发者记录
        </Link>
      </p>
    </div>
  );
}
