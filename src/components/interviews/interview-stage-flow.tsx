"use client";

import type { InterviewStageProgress } from "@/lib/interviews/analytics";

import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    firstInterview: "一面",
    secondInterview: "二面",
    thirdInterview: "三面",
    hrInterview: "HR 面",
    rejectedPrefix: "已拒绝 ",
    rejectedSuffix: "，未记录发生轮次，不接入上方任一阶段",
    note: "数字为「至少到达」该轮次的岗位数，综合投递阶段与真实面试记录取较高值。",
  },
  en: {
    firstInterview: "1st round",
    secondInterview: "2nd round",
    thirdInterview: "3rd round",
    hrInterview: "HR round",
    rejectedPrefix: "Rejected ",
    rejectedSuffix: " — round not recorded, so not counted in any stage above",
    note: "Counts are roles that reached at least that round, taking the higher of application stage and real interview records.",
  },
});

const stages = ["firstInterview", "secondInterview", "thirdInterview", "hrInterview"] as const;

function StageNode({
  count,
  label,
  tone = "default",
}: {
  count: number;
  label: string;
  /** accent：Offer 这一格，且只在数字大于 0 时点亮；0 没什么可强调的。 */
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-control border px-3 py-2.5",
        tone === "accent" ? "border-accent-strong bg-accent" : "border-border bg-surface-subtle",
      )}
    >
      <p className={cn("text-xs", tone === "accent" ? "text-accent-foreground" : "text-muted-foreground")}>
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-medium tabular-nums leading-7",
          tone === "accent" ? "text-accent-foreground" : count > 0 ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {count}
      </p>
    </div>
  );
}

/** 阶段连接线：已有岗位到达该阶段时亮起为品牌色，不做跑马动画。 */
function Connector({ active, vertical = false }: { active: boolean; vertical?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "shrink-0",
        vertical ? "mx-auto h-4 w-px" : "mt-7 h-px w-6 lg:w-10",
        active ? "bg-brand" : "bg-border-strong",
      )}
    />
  );
}

export function InterviewStageFlow({ progress }: { progress: InterviewStageProgress }) {
  const t = useMessages(messages);
  const stageValues = stages.map((key) => ({ label: t[key], key, count: progress[key] }));

  return (
    <div>
      <div className="hidden items-start md:flex">
        {stageValues.map((stage) => (
          <div className="contents" key={stage.key}>
            <StageNode count={stage.count} label={stage.label} />
            <Connector active={stage.count > 0} />
          </div>
        ))}
        <StageNode count={progress.offer} label="Offer" tone={progress.offer > 0 ? "accent" : "default"} />
      </div>

      <div className="md:hidden">
        {stageValues.map((stage) => (
          <div key={stage.key}>
            <StageNode count={stage.count} label={stage.label} />
            <Connector active={stage.count > 0} vertical />
          </div>
        ))}
        <StageNode count={progress.offer} label="Offer" tone={progress.offer > 0 ? "accent" : "default"} />
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {t.rejectedPrefix}<span className="font-mono tabular-nums text-foreground">{progress.rejected}</span>
          {t.rejectedSuffix}
        </span>
        <span>{t.note}</span>
      </div>
    </div>
  );
}
