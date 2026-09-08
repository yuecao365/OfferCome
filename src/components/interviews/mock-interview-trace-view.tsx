import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { INTERVIEW_PACE_LABELS } from "@/lib/mock-interviews/interviewer/brief";
import type { MockInterviewTrace, MockInterviewTraceTurn } from "@/lib/mock-interviews/types";

/**
 * 决策记录：按回合展示候选人的话、面试官的话、模型提案 → 代码裁决、信息量变化、
 * 记忆增量与模型开销。只读，给开发者与评测看，不给候选人看。
 */

const KIND_LABELS: Record<string, string> = {
  intro_request: "开场",
  question: "切入问题",
  probe: "追问",
  rescue: "提示",
  clarify: "澄清",
  interrupt: "打断",
  closing: "收尾",
  aside: "只说话",
  answer: "回答",
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function DecisionLine({ decision }: { decision: NonNullable<MockInterviewTraceTurn["decision"]> }) {
  const replaced = decision.proposedAction !== decision.appliedAction;
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <p>
        提案 <code className="font-mono text-foreground">{decision.proposedAction ?? "（无）"}</code>
        {" → "}
        裁决 <code className="font-mono text-foreground">{decision.appliedAction ?? "（无）"}</code>
        {decision.followUp ? (
          <>
            {" + "}
            <code className="font-mono text-foreground">{decision.followUp}</code>
          </>
        ) : null}
        {replaced && decision.replacedReason ? <Badge className="ml-2" tone="warning">替换：{decision.replacedReason}</Badge> : null}
        {decision.anchorHit === false ? <Badge className="ml-2" tone="warning">追问未锚定原话</Badge> : null}
        {decision.anchorHit === true ? <Badge className="ml-2" tone="success">追问锚定原话</Badge> : null}
      </p>
      <p>
        信息量 {percent(decision.evidenceBefore)} → {percent(decision.evidenceAfter)}
        {decision.skillsLoaded > 0 ? ` · 查了 ${decision.skillsLoaded} 个技能包` : ""}
        {decision.effects.length > 0 ? ` · 副作用：${decision.effects.join(", ")}` : ""}
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
        description={`${INTERVIEW_PACE_LABELS[trace.pace]}节奏 · 信息量目标 ${percent(trace.evidenceTarget)} · 领域：${trace.areas.map((area) => `${area.name}（目标 ${area.depth} 层）`).join("、")}`}
        title={`决策记录 · ${trace.companyName} · ${trace.jobTitle}`}
      />
      <ol className="grid gap-3">
        {trace.turns.map((turn) => (
          <Card className="grid gap-3 p-4" key={turn.turnIndex}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground">第 {turn.turnIndex + 1} 回合</p>
              {turn.run ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {turn.run.status}
                  {" · "}
                  {(turn.run.durationMs / 1000).toFixed(1)}s
                  {turn.run.totalTokens !== null ? ` · ${turn.run.totalTokens} tokens` : ""}
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
                <span className="mr-2 text-xs text-muted-foreground">面试官 · {KIND_LABELS[message.kind] ?? message.kind}</span>
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
