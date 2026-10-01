"use client";

import { PageHeader } from "@/components/page-header";
import { ReplayTurnButton } from "@/components/interviews/replay-turn-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { VIOLATION_LABELS_I18N } from "@/lib/interview/eval/postmortem";
import { AREA_KIND_LABELS_I18N, AREA_KINDS, INTERVIEW_PACE_LABELS_I18N } from "@/lib/mock-interviews/brief/brief";
import { traceDashboard } from "@/lib/interview/views";
import { AGENT_LABELS_I18N, type TraceStep } from "@/lib/interview/trace-steps";
import type { MockInterviewTrace } from "@/lib/mock-interviews/types";

const messages = defineMessages({
  "zh-CN": {
    kinds: { say: "说话", aside: "答疑", closing: "收尾", fallback: "代码接话", answer: "回答", control: "按钮" } as Record<string, string>,
    steps: { model_call: "模型调用（汇总）", step: "模型调用", tool_result: "工具", repair: "输出修补", budget_exceeded: "预算触顶", interrupted: "挂起", resumed: "续跑", selection: "代码裁决" } as Record<string, string>,
    cached: (n: number) => `（缓存 ${n}）`,
    stepCount: (steps: number, tools: number) => ` · ${steps} 步 / ${tools} 次工具`,
    tool: (name: string, access: string) => `${name}（${access}）`,
    input: "输入：",
    output: "输出：",
    systemPrompt: (n: number) => `系统提示词（${n} 字）`,
    turns: "回合",
    tokensCached: "token（缓存）",
    tokensCachedValue: (total: number, rate: number) => `${total}（${rate}%）`,
    turnP95: "回合 p95",
    fallbacks: "兜底 / 一句多问",
    backToInterview: "返回这场面试",
    description: (pace: string, planCount: number, byKind: string, areaCount: number) => `${pace}节奏 · 材料 ${planCount} 份（${byKind}）· 备课材料 ${areaCount} 份`,
    title: (company: string, job: string) => `开发者记录 · ${company} · ${job}`,
    postmortem: "复盘（从事件现算）",
    summarySeparator: "；",
    prep: (ready: boolean) => `备课${ready ? "备好了" : "没备好"}`,
    trajectory: (evalSteps: string, evalTools: string, invalid: number, hits: number, lookups: number) =>
      ` · 轨迹：评分每段 ${evalSteps} 步 / ${evalTools} 次工具，无效 ${invalid}，触顶 ${hits}，面试官查资料 ${lookups} 次`,
    replies: (r: Record<"answered" | "thin" | "help" | "dont_know" | "not_mine" | "refuse" | "skip" | "long", number>, guards: number) =>
      ` · 回答：答实 ${r.answered}、答空 ${r.thin}、求助 ${r.help}、答不上 ${r.dont_know}、不是我做的 ${r.not_mine}、不作答 ${r.refuse}、跳过 ${r.skip}、超长 ${r.long} · 底线 / 接话 ${guards} 次`,
    violation: (seq: number, rule: string, text: string) => `[${seq}] ${rule}：${text}`,
    guard: (seq: number, reason: string, original: string | null) => `[${seq}] 底线「${reason}」${original ? `，原话：${original}` : ""}`,
    turnTitle: (n: number) => `第 ${n} 回合`,
    facet: (facet: string | number) => ` · 角度 ${facet}`,
    candidateSignal: (signal: string) => ` · 候选人：${signal}`,
    candidate: "候选人",
    composeSeconds: (n: number) => ` · 作答 ${n} 秒`,
    interviewer: "面试官",
    longMessage: (n: number) => ` · 较长 ${n} 字`,
    fallbackBadge: (n: number, reasons: string) => `重出 ${n} 次：${reasons}`,
    material: (name: string) => `材料：${name}`,
    notes: "这回合的笔记",
    stepDetails: (n: number) => `这一步：模型看到的输入、输出与工具（${n} 行）`,
    agentsTitle: "面试后的 agent 轨迹（评分、示范、评论员、档案；每链按步）",
    chainSteps: (n: number) => `${n} 步`,
  },
  en: {
    kinds: { say: "Say", aside: "Aside", closing: "Wrap-up", fallback: "Code fallback", answer: "Answer", control: "Button" },
    steps: { model_call: "Model call (total)", step: "Model call", tool_result: "Tool", repair: "Output repair", budget_exceeded: "Budget hit", interrupted: "Suspended", resumed: "Resumed", selection: "Code decision" },
    cached: (n: number) => ` (cached ${n})`,
    stepCount: (steps: number, tools: number) => ` · ${steps} steps / ${tools} tool calls`,
    tool: (name: string, access: string) => `${name} (${access})`,
    input: "Input: ",
    output: "Output: ",
    systemPrompt: (n: number) => `System prompt (${n} chars)`,
    turns: "Turns",
    tokensCached: "Tokens (cached)",
    tokensCachedValue: (total: number, rate: number) => `${total} (${rate}%)`,
    turnP95: "Turn p95",
    fallbacks: "Fallbacks / multi-question",
    backToInterview: "Back to this interview",
    description: (pace: string, planCount: number, byKind: string, areaCount: number) => `${pace} pace · ${planCount} planned (${byKind}) · ${areaCount} prepared`,
    title: (company: string, job: string) => `Developer trace · ${company} · ${job}`,
    postmortem: "Postmortem (computed from events)",
    summarySeparator: "; ",
    prep: (ready: boolean) => (ready ? "Prep ready" : "Prep not ready"),
    trajectory: (evalSteps: string, evalTools: string, invalid: number, hits: number, lookups: number) =>
      ` · Trajectory: scoring ${evalSteps} steps / ${evalTools} tool calls per segment, ${invalid} invalid, ${hits} budget hits, ${lookups} interviewer lookups`,
    replies: (r: Record<"answered" | "thin" | "help" | "dont_know" | "not_mine" | "refuse" | "skip" | "long", number>, guards: number) =>
      ` · Replies: substantive ${r.answered}, thin ${r.thin}, hint ${r.help}, don't know ${r.dont_know}, not mine ${r.not_mine}, refused ${r.refuse}, skipped ${r.skip}, too long ${r.long} · guards / fallbacks ${guards}`,
    violation: (seq: number, rule: string, text: string) => `[${seq}] ${rule}: ${text}`,
    guard: (seq: number, reason: string, original: string | null) => `[${seq}] Guard "${reason}"${original ? `, original: ${original}` : ""}`,
    turnTitle: (n: number) => `Turn ${n}`,
    facet: (facet: string | number) => ` · angle ${facet}`,
    candidateSignal: (signal: string) => ` · candidate: ${signal}`,
    candidate: "Candidate",
    composeSeconds: (n: number) => ` · answered in ${n}s`,
    interviewer: "Interviewer",
    longMessage: (n: number) => ` · long, ${n} chars`,
    fallbackBadge: (n: number, reasons: string) => `Regenerated ${n}×: ${reasons}`,
    material: (name: string) => `Material: ${name}`,
    notes: "Notes from this turn",
    stepDetails: (n: number) => `This step: model input, output and tools (${n} rows)`,
    agentsTitle: "Post-interview agent trajectories (scoring, exemplars, critic, archive; step by step per chain)",
    chainSteps: (n: number) => `${n} steps`,
  },
});

/**
 * 开发者记录页：按回合展示候选人的话、面试官的话、证据账、模型开销与每步输入输出。
 * 全部从事件日志推导。只读，给开发者与评测看；候选人看的是报告页里的"面试官是怎么问你的"（interviewer-trail.tsx）。
 */

/** 面试官一条话超过这个字数在 trace 页标出来：说话收短靠提示词，代码不截断。 */
const LONG_MESSAGE_CHARS = 150;

/** 一条链的每一步：事件、成败、耗时、token、输入 / 输出片段、工具。 */
function Steps({ steps }: { steps: TraceStep[] }) {
  const t = useMessages(messages);
  return (
    <ol className="grid gap-1 text-[12px] leading-5">
      {steps.map((step, index) => (
        <li className="rounded-control bg-surface-subtle p-2" key={index}>
          <span className="font-mono text-muted-foreground">
            {t.steps[step.event] ?? step.event} · {step.status}
            {step.durationMs > 0 ? ` · ${(step.durationMs / 1000).toFixed(1)}s` : ""}
            {step.totalTokens !== null ? ` · ${step.totalTokens} tokens` : ""}
            {step.cachedTokens !== null && step.cachedTokens > 0 ? t.cached(step.cachedTokens) : ""}
            {step.errorKind ? ` · ${step.errorKind}` : ""}
            {step.metrics && step.event === "model_call" && typeof step.metrics.steps === "number" ? t.stepCount(step.metrics.steps, step.metrics.toolCalls ?? 0) : ""}
          </span>
          {step.tool ? (
            <p className="mt-1">
              <Badge tone={step.tool.ok ? "neutral" : "warning"}>{t.tool(step.tool.name, step.tool.access)}</Badge>
              <span className="ml-1 font-mono">{step.tool.input}</span>
              {step.output ? <span className="ml-1 text-muted-foreground">→ {step.output}</span> : null}
            </p>
          ) : null}
          {step.input ? (
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {t.input}
              {step.input}
            </p>
          ) : null}
          {!step.tool && step.output ? (
            <p className="mt-1 whitespace-pre-wrap">
              {t.output}
              {step.output}
            </p>
          ) : null}
          {step.system ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-muted-foreground">{t.systemPrompt(step.system.length)}</summary>
              <pre className="mt-1 whitespace-pre-wrap font-sans">{step.system}</pre>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Dashboard({ trace }: { trace: MockInterviewTrace }) {
  const t = useMessages(messages);
  const board = traceDashboard(trace.rows);
  const cell = (label: string, value: string) => (
    <div key={label}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
  return (
    <Card className="grid gap-3 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cell(t.turns, `${board.turns}`)}
        {cell(t.tokensCached, t.tokensCachedValue(board.totalTokens, Math.round(board.cacheRate * 100)))}
        {cell(t.turnP95, `${(board.p95Ms / 1000).toFixed(1)}s`)}
        {cell(t.fallbacks, `${board.fallbacks} / ${Math.round(board.live.multiQuestionRate * 100)}%`)}
      </div>
    </Card>
  );
}

export function MockInterviewTraceView({ trace }: { trace: MockInterviewTrace }) {
  const locale = useLocale();
  const t = useMessages(messages);
  const byKind = AREA_KINDS.map((kind) => `${AREA_KIND_LABELS_I18N[locale][kind]} ${trace.plan.filter((item) => item.kind === kind).length}`).join(" / ");
  return (
    <>
      <PageHeader
        actions={
          <ButtonLink href={`/interviews/mock/${trace.id}`} variant="outline">
            {t.backToInterview}
          </ButtonLink>
        }
        description={t.description(INTERVIEW_PACE_LABELS_I18N[locale][trace.pace], trace.plan.length, byKind, trace.areas.length)}
        title={t.title(trace.companyName, trace.jobTitle)}
      />
      <Dashboard trace={trace} />
      {trace.postmortem ? (
        <Card className="grid gap-2 p-4 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">{t.postmortem}</p>
          <p className="text-muted-foreground">{trace.postmortem.summary.join(t.summarySeparator)}</p>
          <p className="text-xs text-muted-foreground">
            {t.prep(trace.postmortem.ready)}
            {trace.postmortem.trajectory
              ? t.trajectory(
                  trace.postmortem.trajectory.evaluationSteps?.toFixed(1) ?? "—",
                  trace.postmortem.trajectory.evaluationToolCalls?.toFixed(1) ?? "—",
                  trace.postmortem.trajectory.invalidToolCalls,
                  trace.postmortem.trajectory.budgetHits,
                  trace.postmortem.trajectory.interviewerLookups,
                )
              : ""}
            {t.replies(trace.postmortem.replies, trace.postmortem.guards.length)}
          </p>
          {trace.postmortem.violations.map((item) => (
            <p className="text-xs text-warning-strong" key={`${item.seq}-${item.rule}`}>
              {t.violation(item.seq, VIOLATION_LABELS_I18N[locale][item.rule], item.text.slice(0, 80))}
            </p>
          ))}
          {trace.postmortem.guards.map((item) => (
            <p className="text-xs text-muted-foreground" key={`guard-${item.seq}`}>
              {t.guard(item.seq, item.reason, item.original ? item.original.slice(0, 80) : null)}
            </p>
          ))}
        </Card>
      ) : null}
      <ol className="grid gap-3">
        {trace.rows.map((turn) => (
          <Card className="grid gap-3 p-4" key={turn.turnIndex}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t.turnTitle(turn.turnIndex + 1)}
                {turn.action ? ` · ${turn.action}` : ""}
                {turn.facet !== null ? t.facet(typeof turn.facet === "number" ? turn.facet + 1 : turn.facet) : ""}
                {turn.candidate?.signal ? t.candidateSignal(turn.candidate.signal) : ""}
              </p>
              {turn.run ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {turn.run.status}
                  {" · "}
                  {(turn.run.durationMs / 1000).toFixed(1)}s
                  {turn.run.totalTokens !== null ? ` · ${turn.run.totalTokens} tokens` : ""}
                  {turn.run.cachedTokens !== null && turn.run.cachedTokens > 0 ? t.cached(turn.run.cachedTokens) : ""}
                  {turn.run.errorKind ? ` · ${turn.run.errorKind}` : ""}
                </p>
              ) : null}
            </div>
            {turn.candidate ? (
              <div className="rounded-control bg-accent px-3 py-2 text-sm leading-6 text-accent-foreground">
                <span className="mr-2 text-xs opacity-70">
                  {t.candidate} · {t.kinds[turn.candidate.kind] ?? turn.candidate.kind}
                  {turn.candidate.composeMs !== null ? t.composeSeconds(Math.round(turn.candidate.composeMs / 1000)) : ""}
                </span>
                <span className="whitespace-pre-wrap">{turn.candidate.content}</span>
              </div>
            ) : null}
            {turn.interviewer.map((message, index) => (
              <div className="rounded-control border border-border bg-surface px-3 py-2 text-sm leading-6" key={index}>
                <span className="mr-2 text-xs text-muted-foreground">
                  {t.interviewer} · {t.kinds[message.kind] ?? message.kind}
                  {message.content.length > LONG_MESSAGE_CHARS ? t.longMessage(message.content.length) : ""}
                </span>
                <span className="whitespace-pre-wrap">{message.content}</span>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {turn.fallback ? <Badge tone="warning">{t.fallbackBadge(turn.fallbackReasons.length, turn.fallbackReasons.join(t.summarySeparator))}</Badge> : null}
              {turn.topic ? <span className="rounded-control bg-surface-subtle px-2 py-1">{t.material(trace.areas.find((area) => area.id === turn.topic)?.name ?? turn.topic)}</span> : null}
              {turn.notes ? (
                <details className="w-full">
                  <summary className="cursor-pointer">{t.notes}</summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded-control bg-surface-subtle px-2 py-1 font-sans text-xs leading-5">{turn.notes}</pre>
                </details>
              ) : null}
              {turn.run && turn.run.steps.length > 0 ? (
                <details className="w-full">
                  <summary className="cursor-pointer">{t.stepDetails(turn.run.steps.length)}</summary>
                  <div className="mt-1">
                    <Steps steps={turn.run.steps} />
                  </div>
                </details>
              ) : null}
              {trace.postmortem ? <ReplayTurnButton sessionId={trace.id} turnIndex={turn.turnIndex} /> : null}
            </div>
          </Card>
        ))}
      </ol>
      {trace.agents.length > 0 ? (
        <Card className="grid gap-3 p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t.agentsTitle}</p>
          <ol className="grid gap-2">
            {trace.agents.map((chain) => (
              <li key={chain.runId}>
                <details>
                  <summary className="cursor-pointer text-sm">
                    {AGENT_LABELS_I18N[locale][chain.agent] ?? chain.agent}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {chain.runId} · {chain.status} · {(chain.durationMs / 1000).toFixed(1)}s · {chain.totalTokens} tokens · {t.chainSteps(chain.steps.length)}
                    </span>
                  </summary>
                  <div className="mt-2">
                    <Steps steps={chain.steps} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </>
  );
}
