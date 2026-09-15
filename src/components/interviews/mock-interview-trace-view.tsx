import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AREA_KIND_LABELS, AREA_KINDS, INTERVIEW_PACE_LABELS } from "@/lib/mock-interviews/brief/brief";
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {turn.fallback ? <Badge tone="warning">模型没说出话，代码接了一句</Badge> : null}
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
