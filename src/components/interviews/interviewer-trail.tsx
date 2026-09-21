import { Card } from "@/components/ui/card";
import { MetaText } from "@/components/ui/data-table";
import { cn } from "@/lib/cn";
import type { ReviewTrail, TrailGroup, TrailNode } from "@/lib/interview/review-trail";
import { AREA_KIND_LABELS } from "@/lib/mock-interviews/brief/brief";

/**
 * 报告页的一节：面试官是怎么问你的。按材料分组的时间线，一回合一行——动作 + 为什么这么问；
 * 第二行是面试官记下的证据账；被追到 / 记了存疑 / 你没答上的回合左边点亮。展开一行才看原对话。
 * 只有能帮你下次改进的东西；开发者数据（token、耗时、兜底）在开发者记录页。本地版与体验版共用。
 */

const HIGHLIGHT: Record<NonNullable<TrailNode["highlight"]>, { label: string; className: string }> = {
  pressed: { label: "这里被追到了", className: "border-l-brand" },
  doubt: { label: "面试官记了存疑", className: "border-l-warning-strong" },
  stuck: { label: "你没答上", className: "border-l-warning-strong" },
};

function Node({ node }: { node: TrailNode }) {
  const mark = node.highlight ? HIGHLIGHT[node.highlight] : null;
  return (
    <li className={cn("border-l-2 pl-3", mark ? mark.className : "border-l-border")}>
      <details className="group">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-6">
            <span className="font-medium text-foreground">{node.move}</span>
            {node.why ? <span className="text-muted-foreground">{node.why}</span> : null}
            {node.candidateNote ? <MetaText>{node.candidateNote}</MetaText> : null}
            {mark ? <MetaText className={node.highlight === "pressed" ? "text-brand" : "text-warning-strong"}>{mark.label}</MetaText> : null}
          </div>
          {node.ledger ? <p className="text-xs leading-5 text-muted-foreground">它记下的：{node.ledger}</p> : null}
        </summary>
        <div className="mt-2 grid gap-2 text-sm leading-6">
          {node.exchange.candidate ? (
            <p className="rounded-control bg-accent px-3 py-2 text-accent-foreground">
              <span className="mr-2 text-xs opacity-70">你</span>
              <span className="whitespace-pre-wrap">{node.exchange.candidate}</span>
            </p>
          ) : null}
          <p className="rounded-control border border-border bg-surface px-3 py-2 text-foreground">
            <span className="mr-2 text-xs text-muted-foreground">面试官</span>
            <span className="whitespace-pre-wrap">{node.exchange.interviewer}</span>
          </p>
        </div>
      </details>
    </li>
  );
}

function Group({ group }: { group: TrailGroup }) {
  const notes = [group.probes > 0 ? `追了 ${group.probes} 句` : "", group.doubts > 0 ? `${group.doubts} 处存疑` : ""].filter(Boolean);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium text-foreground">{group.name}</span>
        <MetaText>{AREA_KIND_LABELS[group.kind]}</MetaText>
        {notes.length > 0 ? <MetaText>{notes.join(" · ")}</MetaText> : null}
      </div>
      <ol className="grid gap-2">
        {group.nodes.map((node) => (
          <Node key={node.turnIndex} node={node} />
        ))}
      </ol>
    </div>
  );
}

export function InterviewerTrail({ trail }: { trail: ReviewTrail }) {
  if (trail.groups.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-foreground">面试官是怎么问你的</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {trail.hasReasons ? "每一步为什么这么问、它当时记下了什么。点开一行看原话。" : "这场没有记下面试官的理由，只列它的动作。点开一行看原话。"}
      </p>
      <div className="mt-4 grid gap-5">
        {trail.groups.map((group) => (
          <Group group={group} key={group.areaId} />
        ))}
      </div>
      {trail.closing ? <p className="mt-4 text-xs leading-5 text-muted-foreground">收尾：{trail.closing}</p> : null}
    </Card>
  );
}
