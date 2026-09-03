import type { InterviewStageProgress } from "@/lib/interviews/analytics";

import { cn } from "@/lib/cn";

const stages = [
  ["一面", "firstInterview"],
  ["二面", "secondInterview"],
  ["三面", "thirdInterview"],
  ["HR 面", "hrInterview"],
] as const;

function StageNode({
  count,
  label,
  tone = "default",
}: {
  count: number;
  label: string;
  tone?: "default" | "success";
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-control border px-3 py-2.5",
        tone === "success" ? "border-success/25 bg-success-soft" : "border-border bg-surface-subtle",
      )}
    >
      <p className={cn("text-xs", tone === "success" ? "text-success-strong" : "text-muted-foreground")}>
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-medium tabular-nums leading-7",
          tone === "success" ? "text-success-strong" : count > 0 ? "text-foreground" : "text-muted-foreground",
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
  const stageValues = stages.map(([label, key]) => ({ label, key, count: progress[key] }));

  return (
    <div>
      <div className="hidden items-start md:flex">
        {stageValues.map((stage) => (
          <div className="contents" key={stage.key}>
            <StageNode count={stage.count} label={stage.label} />
            <Connector active={stage.count > 0} />
          </div>
        ))}
        <StageNode count={progress.offer} label="Offer" tone="success" />
      </div>

      <div className="md:hidden">
        {stageValues.map((stage) => (
          <div key={stage.key}>
            <StageNode count={stage.count} label={stage.label} />
            <Connector active={stage.count > 0} vertical />
          </div>
        ))}
        <StageNode count={progress.offer} label="Offer" tone="success" />
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          已拒绝 <span className="font-mono tabular-nums text-foreground">{progress.rejected}</span>
          ，未记录发生轮次，不接入上方任一阶段
        </span>
        <span>数字为「至少到达」该轮次的岗位数，综合投递阶段与真实面试记录取较高值。</span>
      </div>
    </div>
  );
}
