import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetaText } from "@/components/ui/data-table";
import { cn } from "@/lib/cn";
import { levelLabel } from "@/lib/interview/estimator";
import { AREA_KIND_LABELS, KIND_WEIGHT, type AreaKind, type HypothesisSource } from "@/lib/mock-interviews/brief/brief";
import type { MockInterviewReport as ReportData } from "@/lib/mock-interviews/report";
import type { MockInterviewView } from "@/lib/mock-interviews/types";

import { InterviewerTrail } from "./interviewer-trail";
import { QuestionDimensionScores } from "./mock-interview-report-visuals";

/**
 * 报告页版式：首屏两张卡（总分 | 总评）→ 失守与练法（≤ 3 条并排）→ 站得住的 → 备课要验证的说法（岗位要求在前）→ 能力估计 → 面试官思路 → 逐段（默认折叠）。
 * 首屏之后全部通栏、按内容长高：一场面试短板 1 条还是 3 条、有没有测到能力，都不会留出整块空白。细节折叠在逐段里；开发者记录只留页尾一个链接。本地版与体验版共用。
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

const HYPOTHESIS_SOURCE_LABELS: Record<HypothesisSource, string> = { jd: "岗位要求", resume: "简历" };

/** 备课时列的要验证的说法：岗位要求的在前（那是这份 JD 唯一进面试的地方），简历上的在后；只列这场验过的。 */
function Hypotheses({ items }: { items: ReportData["hypotheses"] }) {
  if (items.length === 0) return null;
  const judged = [...items.filter((item) => item.status !== "open")].sort((a, b) => Number((b.source ?? "resume") === "jd") - Number((a.source ?? "resume") === "jd"));
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">备课要验证的说法，验出来了什么</h3>
      <div className="mt-2 grid gap-2">
        {judged.map((item) => {
          const status = HYPOTHESIS_STATUS[item.status] ?? HYPOTHESIS_STATUS.open;
          return (
            <div className="flex flex-wrap items-start gap-2" key={item.text}>
              <Badge tone={status.tone}>{status.label}</Badge>
              <MetaText className="leading-6">{HYPOTHESIS_SOURCE_LABELS[item.source ?? "resume"]}</MetaText>
              <p className="min-w-0 flex-1 basis-64 text-sm leading-6 text-foreground">{item.verdict ?? item.text}</p>
            </div>
          );
        })}
        {judged.length === 0 ? <p className="text-sm leading-6 text-muted-foreground">这场没有验到备课时列的说法。</p> : null}
      </div>
    </Card>
  );
}

/** 事后的能力估计：只列测到的，一行胶囊：名字 + 档位。没测到的不提，没测到任何一项就不出这张卡。 */
function Estimates({ items }: { items: MockInterviewView["estimates"] }) {
  const measured = items.filter((item) => item.samples > 0);
  if (measured.length === 0) return null;
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">能力估计</h3>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm leading-6 text-muted-foreground">
        {measured.map((item) => (
          <li className="flex items-center gap-1.5" key={item.competencyId}>
            <span className="text-foreground">{item.name}</span>
            <Badge tone={item.mean >= 0.7 ? "success" : item.mean >= 0.4 ? "neutral" : "warning"}>{levelLabel(item.mean)}</Badge>
          </li>
        ))}
      </ul>
    </Card>
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
    <div className="reveal-group grid gap-4">
      {/* 首屏：左总分卡，右总评卡 */}
      <section className="grid gap-4 md:grid-cols-[minmax(220px,0.35fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <p className="text-[0.8125rem] text-muted-foreground">面试总分</p>
          <p className="mt-1 text-display tabular-nums text-foreground">
            {report.totalScore}
            <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">/ 100</span>
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{scoreFormula(session.questions)}</p>
        </Card>
        <Card className="flex flex-col p-5">
          <h3 className="text-sm font-semibold text-foreground">总体评价</h3>
          <p className="mt-2 flex-1 whitespace-pre-wrap text-[0.8125rem] leading-6 text-muted-foreground">{report.summary}</p>
          <div className="mt-4">
            <ButtonLink href="/interviews/profile" size="sm" variant="outline">
              查看能力画像
            </ButtonLink>
          </div>
        </Card>
      </section>

      {/* 失守是主卡：短板并排成格，几条就几格，不留空列。 */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">失守在哪、练什么</h3>
        {report.weaknesses.length === 0 ? <p className="mt-3 text-sm leading-6 text-muted-foreground">没有明显短板。</p> : null}
        <ul className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          {report.weaknesses.slice(0, MAX_WEAKNESSES).map((item) => (
            <li className="rounded-control bg-surface-subtle p-3" key={item.point}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">{WEAKNESS_KIND_LABELS[item.kind] ?? item.kind}</Badge>
                {item.areaName ? <MetaText>{item.areaName}</MetaText> : null}
              </div>
              <p className="mt-2 text-foreground">{item.point}</p>
              {item.practice ? <p className="mt-1">练：{item.practice}</p> : null}
            </li>
          ))}
        </ul>
        {report.weaknesses.length > MAX_WEAKNESSES ? <p className="mt-3 text-xs text-muted-foreground">其余 {report.weaknesses.length - MAX_WEAKNESSES} 条在逐段反馈里。</p> : null}
      </Card>

      {report.strengths.length > 0 ? (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground">站得住的</h3>
          <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-muted-foreground md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            {report.strengths.slice(0, MAX_STRENGTHS).map((item) => (
              <li key={item.point}>· {item.point}</li>
            ))}
          </ul>
        </Card>
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
