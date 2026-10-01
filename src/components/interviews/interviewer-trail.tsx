"use client";

import { Card } from "@/components/ui/card";
import { MetaText } from "@/components/ui/data-table";
import { cn } from "@/lib/cn";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import type { ReviewTrail, TrailGroup, TrailNode } from "@/lib/interview/review-trail";
import { AREA_KIND_LABELS_I18N } from "@/lib/mock-interviews/brief/brief";

const messages = defineMessages({
  "zh-CN": {
    highlights: { pressed: "这里被追到了", doubt: "面试官记了存疑", stuck: "你没答上" },
    ledger: "它记下的：",
    you: "你",
    interviewer: "面试官",
    turns: (n: number) => `${n} 回合`,
    probes: (n: number) => `追了 ${n} 句`,
    doubts: (n: number) => `${n} 处存疑`,
    nothingMarked: "这段没有被追到或存疑的地方。",
    restTurns: (n: number) => `其余 ${n} 回合`,
    title: "面试官是怎么问你的",
    withReasons: "只列它追你、记了存疑、你没答上的回合。点开一行看原话。",
    withoutReasons: "这场没有记下面试官的理由，只列它的动作。点开一行看原话。",
  },
  en: {
    highlights: { pressed: "Pressed here", doubt: "Interviewer noted a doubt", stuck: "You couldn't answer" },
    ledger: "What it noted: ",
    you: "You",
    interviewer: "Interviewer",
    turns: (n: number) => `${n} ${n === 1 ? "turn" : "turns"}`,
    probes: (n: number) => `${n} follow-up${n === 1 ? "" : "s"}`,
    doubts: (n: number) => `${n} doubt${n === 1 ? "" : "s"}`,
    nothingMarked: "Nothing here was pressed on or doubted.",
    restTurns: (n: number) => `${n} other ${n === 1 ? "turn" : "turns"}`,
    title: "How the interviewer questioned you",
    withReasons: "Only turns where it pressed you, noted a doubt, or you couldn't answer. Open a row to see what was said.",
    withoutReasons: "No interviewer reasoning was recorded for this session, so only its moves are listed. Open a row to see what was said.",
  },
});

/**
 * 报告页的一节：面试官是怎么问你的。按材料分组，每组一行小结（追了几句、几处存疑），
 * 默认只列被点亮的回合（被追到 / 记了存疑 / 你没答上）：一行动作 + 它当时的打算，存疑的再给一行它新记下的结论；
 * 其余回合折在"其余 N 回合"里。展开一行才看原对话。只有主要判断；开发者数据在开发者记录页。本地版与体验版共用。
 */

const HIGHLIGHT_CLASS: Record<NonNullable<TrailNode["highlight"]>, string> = {
  pressed: "border-l-brand",
  doubt: "border-l-warning-strong",
  stuck: "border-l-warning-strong",
};

function Node({ node }: { node: TrailNode }) {
  const t = useMessages(messages);
  const highlight = node.highlight;
  const showLedger = node.ledger && highlight === "doubt";
  return (
    <li className={cn("border-l-2 pl-3", highlight ? HIGHLIGHT_CLASS[highlight] : "border-l-border")}>
      <details className="group">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-6">
            <span className="font-medium text-foreground">{node.move}</span>
            {node.why ? <span className="text-muted-foreground">{node.why}</span> : null}
            {node.candidateNote ? <MetaText>{node.candidateNote}</MetaText> : null}
            {highlight ? <MetaText className={highlight === "pressed" ? "text-brand" : "text-warning-strong"}>{t.highlights[highlight]}</MetaText> : null}
          </div>
          {showLedger ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {t.ledger}
              {node.ledger}
            </p>
          ) : null}
        </summary>
        <div className="mt-2 grid gap-2 text-sm leading-6">
          {node.exchange.candidate ? (
            <p className="rounded-control bg-accent px-3 py-2 text-accent-foreground">
              <span className="mr-2 text-xs opacity-70">{t.you}</span>
              <span className="whitespace-pre-wrap">{node.exchange.candidate}</span>
            </p>
          ) : null}
          <p className="rounded-control border border-border bg-surface px-3 py-2 text-foreground">
            <span className="mr-2 text-xs text-muted-foreground">{t.interviewer}</span>
            <span className="whitespace-pre-wrap">{node.exchange.interviewer}</span>
          </p>
        </div>
      </details>
    </li>
  );
}

function Group({ group }: { group: TrailGroup }) {
  const locale = useLocale();
  const t = useMessages(messages);
  const notes = [t.turns(group.nodes.length), group.probes > 0 ? t.probes(group.probes) : "", group.doubts > 0 ? t.doubts(group.doubts) : ""].filter(Boolean);
  const marked = group.nodes.filter((node) => node.highlight !== null);
  const rest = group.nodes.filter((node) => node.highlight === null);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium text-foreground">{group.name}</span>
        <MetaText>{AREA_KIND_LABELS_I18N[locale][group.kind]}</MetaText>
        <MetaText>{notes.join(" · ")}</MetaText>
      </div>
      {marked.length > 0 ? (
        <ol className="grid gap-2">
          {marked.map((node) => (
            <Node key={node.turnIndex} node={node} />
          ))}
        </ol>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">{t.nothingMarked}</p>
      )}
      {rest.length > 0 ? (
        <details className="pl-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">{t.restTurns(rest.length)}</summary>
          <ol className="mt-2 grid gap-2">
            {rest.map((node) => (
              <Node key={node.turnIndex} node={node} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

export function InterviewerTrail({ trail }: { trail: ReviewTrail }) {
  const t = useMessages(messages);
  if (trail.groups.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{trail.hasReasons ? t.withReasons : t.withoutReasons}</p>
      <div className="mt-4 grid gap-5">
        {trail.groups.map((group) => (
          <Group group={group} key={group.areaId} />
        ))}
      </div>
    </Card>
  );
}
