import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CRITIC_RULES, type CriticRule } from "@/lib/interview/critic";
import { levelLabel } from "@/lib/interview/estimator";
import { AREA_KIND_LABELS, AREA_KINDS, INTERVIEW_PACE_LABELS } from "@/lib/mock-interviews/brief/brief";
import { traceDashboard } from "@/lib/interview/views";
import type { MockInterviewTrace } from "@/lib/mock-interviews/types";

/**
 * trace 页：按回合展示候选人的话、面试官的话、面试官这回合重写的笔记、时钟估计与模型开销。
 * 全部从事件日志推导。只读，给开发者与评测看，不给候选人看。
 */

const KIND_LABELS: Record<string, string> = {
  say: "说话",
  closing: "收尾",
  fallback: "代码接话",
  answer: "回答",
  control: "按钮",
};

/** 面试官一条话超过这个字数在 trace 页标出来：说话收短靠提示词，代码不截断。 */
const LONG_MESSAGE_CHARS = 150;

function competencyName(trace: MockInterviewTrace, id: string): string {
  return trace.competencies.find((item) => item.id === id)?.name ?? id;
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
        {cell("策略变体", `${trace.flags.policy}${trace.flags.shadow ? ` · 影子 ${trace.flags.shadow}` : ""}${trace.flags.lab ? " · 实验层开" : ""}`)}
        {cell("token（缓存）", `${board.totalTokens}（${Math.round(board.cacheRate * 100)}%）`)}
        {cell("回合 p95", `${(board.p95Ms / 1000).toFixed(1)}s`)}
        {cell("兜底 / 评论员提醒", `${board.fallbacks} / ${board.criticNotes}`)}
      </div>
      {board.shadow ? (
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 md:grid-cols-4">
          {cell("真身：一句多问", `${Math.round(board.live.multiQuestionRate * 100)}% · 平均 ${board.live.avgChars} 字`)}
          {cell(`影子 ${board.shadow.variant}：一句多问`, `${Math.round(board.shadow.multiQuestionRate * 100)}% · 平均 ${board.shadow.avgChars} 字`)}
          {cell("真身：被评论员提醒", `${Math.round((board.criticNotes / Math.max(1, board.turns)) * 100)}%`)}
          {cell("影子：被评论员判违反", `${Math.round(board.shadow.criticRate * 100)}%（${board.shadow.turns} 句）`)}
        </div>
      ) : null}
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
        description={`${INTERVIEW_PACE_LABELS[trace.pace]}节奏 · ${trace.totalMinutes} 分钟 · 材料：${AREA_KINDS.map((kind) => `${AREA_KIND_LABELS[kind]} ${trace.areas.filter((area) => area.kind === kind).length} 道`).join(" / ")}`}
        title={`决策记录 · ${trace.companyName} · ${trace.jobTitle}`}
      />
      <Dashboard trace={trace} />
      <ol className="grid gap-3">
        {trace.rows.map((turn) => (
          <Card className="grid gap-3 p-4" key={turn.turnIndex}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground">
                第 {turn.turnIndex + 1} 回合
                {turn.clock ? ` · 已用约 ${turn.clock.usedMinutes} / ${turn.clock.totalMinutes} 分钟` : ""}
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
            {turn.shadow ? (
              <div className="rounded-control border border-dashed border-border px-3 py-2 text-sm leading-6 text-muted-foreground">
                <span className="mr-2 text-xs">影子 {turn.shadow.variant}{turn.shadow.rule ? ` · 评论员：${turn.shadow.rule}` : ""}</span>
                <span className="whitespace-pre-wrap">{turn.shadow.say}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {turn.fallback ? <Badge tone="warning">模型没说出话，代码接了一句</Badge> : null}
              {turn.move ? <span className="rounded-control bg-surface-subtle px-2 py-1">建议：{turn.move.move} · {turn.move.reason}</span> : null}
              {turn.topic ? <span className="rounded-control bg-surface-subtle px-2 py-1">材料：{trace.areas.find((area) => area.id === turn.topic)?.name ?? turn.topic}</span> : null}
              {turn.critic ? <Badge tone="warning">评论员 · {CRITIC_RULES[turn.critic.rule as CriticRule] ? turn.critic.rule : "准则"}：{turn.critic.text}</Badge> : null}
              {turn.scored.map((item) => (
                <span className="rounded-control bg-surface-subtle px-2 py-1" key={`${item.competencyId}-${item.score}`} title={item.note}>
                  评委：{competencyName(trace, item.competencyId)} · 第 {item.difficulty} 层 · {Math.round(item.score)} 分（把握 {item.confidence.toFixed(1)}）
                </span>
              ))}
              {turn.estimates.map((item) => (
                <span className="rounded-control bg-surface-subtle px-2 py-1" key={`${item.competencyId}-${item.samples}`}>
                  估计：{competencyName(trace, item.competencyId)} {levelLabel(item.mean)}（置信 {levelLabel(item.confidence)}，{item.samples} 段）
                </span>
              ))}
              {turn.notebook !== null ? (
                <details className="w-full">
                  <summary className="cursor-pointer">这回合的笔记</summary>
                  <p className="mt-1 whitespace-pre-wrap rounded-control bg-surface-subtle p-2 text-[12px] leading-5">{turn.notebook || "（空）"}</p>
                </details>
              ) : (
                <span>笔记没变</span>
              )}
            </div>
          </Card>
        ))}
      </ol>
    </>
  );
}
