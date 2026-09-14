import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { THREAD_VERDICT_LABELS } from "@/lib/mock-interviews/interviewer/actions";
import { AREA_KIND_LABELS, AREA_KINDS, INTERVIEW_PACE_LABELS } from "@/lib/mock-interviews/interviewer/brief";
import type { MockInterviewTrace, MockInterviewTraceTurn } from "@/lib/mock-interviews/types";

/**
 * 决策记录：按回合展示候选人的话、面试官的话、面试官这回合的记账（改计划、进入 / 离开话题、收尾）、
 * 记忆增量与模型开销。只读，给开发者与评测看，不给候选人看。
 */

const KIND_LABELS: Record<string, string> = {
  intro_request: "开场",
  question: "进入话题",
  probe: "追问",
  closing: "收尾",
  aside: "插话",
  answer: "回答",
};

const ENDED_BY_LABELS: Record<string, string> = { interviewer: "面试官收尾", candidate: "候选人结束", budget: "预算用完" };

/** 面试官一条话超过这个字数在 trace 页标出来：说话收短靠提示词，代码不截断。 */
const LONG_MESSAGE_CHARS = 150;

function DecisionLine({ decision }: { decision: NonNullable<MockInterviewTraceTurn["decision"]> }) {
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <p className="flex flex-wrap items-center gap-2">
        {decision.planChanged ? <Badge>改了计划</Badge> : null}
        {decision.left ? <Badge tone={decision.left === "answered" ? "success" : "warning"}>离开：{THREAD_VERDICT_LABELS[decision.left]}</Badge> : null}
        {decision.entered ? <Badge>进入：{decision.entered}</Badge> : null}
        {decision.endedBy ? <Badge tone="neutral">{ENDED_BY_LABELS[decision.endedBy] ?? decision.endedBy}</Badge> : null}
        {decision.failed ? <Badge tone="warning">模型没说出话，代码接了一句</Badge> : null}
        <span>
          已说 {decision.turnsUsed} 回合
          {decision.skillsLoaded > 0 ? ` · 查了 ${decision.skillsLoaded} 个技能包` : ""}
          {decision.effects.length > 0 ? ` · 副作用：${decision.effects.join(", ")}` : ""}
        </span>
      </p>
      {decision.memoryPatch ? (
        <details>
          <summary className="cursor-pointer">记忆增量</summary>
          <pre className="mt-1 overflow-x-auto rounded-control bg-surface-subtle p-2 font-mono text-[11px] leading-4">
            {JSON.stringify(decision.memoryPatch, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
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
        description={`${INTERVIEW_PACE_LABELS[trace.pace]}节奏 · 共 ${trace.turns} 回合 · 材料：${AREA_KINDS.map((kind) => `${AREA_KIND_LABELS[kind]} ${trace.areas.filter((area) => area.kind === kind).length} 道`).join(" / ")}`}
        title={`决策记录 · ${trace.companyName} · ${trace.jobTitle}`}
      />
      <ol className="grid gap-3">
        {trace.rows.map((turn) => (
          <Card className="grid gap-3 p-4" key={turn.turnIndex}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground">第 {turn.turnIndex + 1} 回合</p>
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
                  面试官 · {message.kind === "aside" ? "答疑（不算回合）" : (KIND_LABELS[message.kind] ?? message.kind)}
                  {message.content.length > LONG_MESSAGE_CHARS ? ` · 较长 ${message.content.length} 字` : ""}
                </span>
                <span className="whitespace-pre-wrap">{message.content}</span>
              </div>
            ))}
            {turn.decision ? <DecisionLine decision={turn.decision} /> : <p className="text-xs text-muted-foreground">（这回合没有决策记录）</p>}
          </Card>
        ))}
      </ol>
    </>
  );
}
