import { PageHeader } from "@/components/page-header";
import { ReplayTurnButton } from "@/components/interviews/replay-turn-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VIOLATION_LABELS } from "@/lib/interview/eval/postmortem";
import { AREA_KIND_LABELS, AREA_KINDS, INTERVIEW_PACE_LABELS } from "@/lib/mock-interviews/brief/brief";
import { traceDashboard } from "@/lib/interview/views";
import type { TraceStep } from "@/lib/interview/trace-steps";
import type { MockInterviewTrace } from "@/lib/mock-interviews/types";

/**
 * 开发者记录页：按回合展示候选人的话、面试官的话、证据账、模型开销与每步输入输出。
 * 全部从事件日志推导。只读，给开发者与评测看；候选人看的是报告页里的"面试官是怎么问你的"（interviewer-trail.tsx）。
 */

const KIND_LABELS: Record<string, string> = {
  say: "说话",
  aside: "答疑",
  closing: "收尾",
  fallback: "代码接话",
  answer: "回答",
  control: "按钮",
};

/** 面试官一条话超过这个字数在 trace 页标出来：说话收短靠提示词，代码不截断。 */
const LONG_MESSAGE_CHARS = 150;

const STEP_LABELS: Record<string, string> = { model_call: "模型调用（汇总）", step: "模型调用", tool_result: "工具", repair: "输出修补", budget_exceeded: "预算触顶", interrupted: "挂起", resumed: "续跑", selection: "代码裁决" };

/** 一条链的每一步：事件、成败、耗时、token、输入 / 输出片段、工具。 */
function Steps({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className="grid gap-1 text-[12px] leading-5">
      {steps.map((step, index) => (
        <li className="rounded-control bg-surface-subtle p-2" key={index}>
          <span className="font-mono text-muted-foreground">
            {STEP_LABELS[step.event] ?? step.event} · {step.status}
            {step.durationMs > 0 ? ` · ${(step.durationMs / 1000).toFixed(1)}s` : ""}
            {step.totalTokens !== null ? ` · ${step.totalTokens} tokens` : ""}
            {step.cachedTokens !== null && step.cachedTokens > 0 ? `（缓存 ${step.cachedTokens}）` : ""}
            {step.errorKind ? ` · ${step.errorKind}` : ""}
            {step.metrics && step.event === "model_call" && typeof step.metrics.steps === "number" ? ` · ${step.metrics.steps} 步 / ${step.metrics.toolCalls ?? 0} 次工具` : ""}
          </span>
          {step.tool ? (
            <p className="mt-1">
              <Badge tone={step.tool.ok ? "neutral" : "warning"}>{step.tool.name}（{step.tool.access}）</Badge>
              <span className="ml-1 font-mono">{step.tool.input}</span>
              {step.output ? <span className="ml-1 text-muted-foreground">→ {step.output}</span> : null}
            </p>
          ) : null}
          {step.input ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">输入：{step.input}</p> : null}
          {!step.tool && step.output ? <p className="mt-1 whitespace-pre-wrap">输出：{step.output}</p> : null}
          {step.system ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-muted-foreground">系统提示词（{step.system.length} 字）</summary>
              <pre className="mt-1 whitespace-pre-wrap font-sans">{step.system}</pre>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Dashboard({ trace }: { trace: MockInterviewTrace }) {
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
        {cell("回合", `${board.turns}`)}
        {cell("token（缓存）", `${board.totalTokens}（${Math.round(board.cacheRate * 100)}%）`)}
        {cell("回合 p95", `${(board.p95Ms / 1000).toFixed(1)}s`)}
        {cell("兜底 / 一句多问", `${board.fallbacks} / ${Math.round(board.live.multiQuestionRate * 100)}%`)}
      </div>
    </Card>
  );
}

export function MockInterviewTraceView({ trace }: { trace: MockInterviewTrace }) {
  return (
    <>
      <PageHeader
        actions={
          <ButtonLink href={`/interviews/mock/${trace.id}`} variant="outline">
            返回这场面试
          </ButtonLink>
        }
        description={`${INTERVIEW_PACE_LABELS[trace.pace]}节奏 · 配额 ${trace.plan.length} 份（${AREA_KINDS.map((kind) => `${AREA_KIND_LABELS[kind]} ${trace.plan.filter((item) => item.kind === kind).length}`).join(" / ")}）· 备课材料 ${trace.areas.length} 份`}
        title={`开发者记录 · ${trace.companyName} · ${trace.jobTitle}`}
      />
      <Dashboard trace={trace} />
      {trace.postmortem ? (
        <Card className="grid gap-2 p-4 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">复盘（从事件现算）</p>
          <p className="text-muted-foreground">{trace.postmortem.summary.join("；")}</p>
          <p className="text-xs text-muted-foreground">
            备课{trace.postmortem.ready ? "备好了" : "没备好"}
            {trace.postmortem.trajectory ? ` · 轨迹：评分每段 ${trace.postmortem.trajectory.evaluationSteps?.toFixed(1) ?? "—"} 步 / ${trace.postmortem.trajectory.evaluationToolCalls?.toFixed(1) ?? "—"} 次工具，无效 ${trace.postmortem.trajectory.invalidToolCalls}，触顶 ${trace.postmortem.trajectory.budgetHits}，面试官查资料 ${trace.postmortem.trajectory.interviewerLookups} 次` : ""}
            {" · 回答："}答实 {trace.postmortem.replies.answered}、答空 {trace.postmortem.replies.thin}、求助 {trace.postmortem.replies.help}、答不上 {trace.postmortem.replies.dont_know}、不是我做的 {trace.postmortem.replies.not_mine}、不作答 {trace.postmortem.replies.refuse}、跳过 {trace.postmortem.replies.skip}、超长 {trace.postmortem.replies.long} · 底线 / 接话 {trace.postmortem.guards.length} 次
          </p>
          {trace.postmortem.violations.map((item) => (
            <p className="text-xs text-warning-strong" key={`${item.seq}-${item.rule}`}>
              [{item.seq}] {VIOLATION_LABELS[item.rule]}：{item.text.slice(0, 80)}
            </p>
          ))}
          {trace.postmortem.guards.map((item) => (
            <p className="text-xs text-muted-foreground" key={`guard-${item.seq}`}>
              [{item.seq}] 底线「{item.reason}」{item.original ? `，原话：${item.original.slice(0, 80)}` : ""}
            </p>
          ))}
        </Card>
      ) : null}
      <ol className="grid gap-3">
        {trace.rows.map((turn) => (
          <Card className="grid gap-3 p-4" key={turn.turnIndex}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground">
                第 {turn.turnIndex + 1} 回合
                {turn.action ? ` · ${turn.action}` : ""}
                {turn.facet !== null ? ` · 角度 ${turn.facet + 1}` : ""}
                {turn.candidate?.signal ? ` · 候选人：${turn.candidate.signal}` : ""}
              </p>
              {turn.run ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {turn.run.status}
                  {" · "}
                  {(turn.run.durationMs / 1000).toFixed(1)}s
                  {turn.run.totalTokens !== null ? ` · ${turn.run.totalTokens} tokens` : ""}
                  {turn.run.cachedTokens !== null && turn.run.cachedTokens > 0 ? `（缓存 ${turn.run.cachedTokens}）` : ""}
                  {turn.run.errorKind ? ` · ${turn.run.errorKind}` : ""}
                </p>
              ) : null}
            </div>
            {turn.candidate ? (
              <div className="rounded-control bg-accent px-3 py-2 text-sm leading-6 text-accent-foreground">
                <span className="mr-2 text-xs opacity-70">
                  候选人 · {KIND_LABELS[turn.candidate.kind] ?? turn.candidate.kind}
                  {turn.candidate.composeMs !== null ? ` · 作答 ${Math.round(turn.candidate.composeMs / 1000)} 秒` : ""}
                </span>
                <span className="whitespace-pre-wrap">{turn.candidate.content}</span>
              </div>
            ) : null}
            {turn.interviewer.map((message, index) => (
              <div className="rounded-control border border-border bg-surface px-3 py-2 text-sm leading-6" key={index}>
                <span className="mr-2 text-xs text-muted-foreground">
                  面试官 · {KIND_LABELS[message.kind] ?? message.kind}
                  {message.content.length > LONG_MESSAGE_CHARS ? ` · 较长 ${message.content.length} 字` : ""}
                </span>
                <span className="whitespace-pre-wrap">{message.content}</span>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {turn.fallback ? <Badge tone="warning">重出 {turn.fallbackReasons.length} 次：{turn.fallbackReasons.join("；")}</Badge> : null}
              {turn.why ? <span className="rounded-control bg-surface-subtle px-2 py-1">理由：{turn.why}</span> : null}
              {turn.topic ? <span className="rounded-control bg-surface-subtle px-2 py-1">材料：{trace.areas.find((area) => area.id === turn.topic)?.name ?? turn.topic}</span> : null}
              {turn.ledger ? <span className="w-full rounded-control bg-surface-subtle px-2 py-1">证据账：{turn.ledger}</span> : null}
              {turn.run && turn.run.steps.length > 0 ? (
                <details className="w-full">
                  <summary className="cursor-pointer">这一步：模型看到的输入、输出与工具（{turn.run.steps.length} 行）</summary>
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
          <p className="text-xs font-semibold text-muted-foreground">面试后的 agent 轨迹（评分、示范、评论员、档案；每链按步）</p>
          <ol className="grid gap-2">
            {trace.agents.map((chain) => (
              <li key={chain.runId}>
                <details>
                  <summary className="cursor-pointer text-sm">
                    {chain.label}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {chain.runId} · {chain.status} · {(chain.durationMs / 1000).toFixed(1)}s · {chain.totalTokens} tokens · {chain.steps.length} 步
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
