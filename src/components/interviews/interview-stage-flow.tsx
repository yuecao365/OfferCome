import { CheckCircle2, CircleX } from "lucide-react";

import type { InterviewStageProgress } from "@/lib/interviews/analytics";

const stages = [
  ["一面", "firstInterview"],
  ["二面", "secondInterview"],
  ["三面", "thirdInterview"],
  ["HR 面", "hrInterview"],
] as const;

function StageNode({ count, index, label }: { count: number; index: number; label: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface-subtle p-3 text-center">
      <span className="mx-auto flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
        {index + 1}
      </span>
      <p className="mt-2 text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">至少到达 {count}</p>
    </div>
  );
}

function HorizontalConnector({ active }: { active: boolean }) {
  return (
    <div aria-hidden="true" className="relative mt-8 h-0.5 w-7 shrink-0 overflow-hidden bg-border lg:w-12">
      {active ? <span className="interview-current-x absolute inset-0" /> : null}
    </div>
  );
}

function VerticalConnector({ active }: { active: boolean }) {
  return (
    <div aria-hidden="true" className="relative mx-auto h-6 w-0.5 overflow-hidden bg-border">
      {active ? <span className="interview-current-y absolute inset-0" /> : null}
    </div>
  );
}

export function InterviewStageFlow({ progress }: { progress: InterviewStageProgress }) {
  const stageValues = stages.map(([label, key]) => ({ label, key, count: progress[key] }));

  return (
    <div>
      <div className="hidden items-start md:flex">
        {stageValues.map((stage, index) => (
          <div className="contents" key={stage.key}>
            <StageNode count={stage.count} index={index} label={stage.label} />
            <HorizontalConnector active={stage.count > 0} />
          </div>
        ))}
        <div className="min-w-0 flex-1 rounded-lg border border-success/25 bg-success-soft p-3 text-center">
          <CheckCircle2 aria-hidden="true" className="mx-auto size-7 text-success-strong" />
          <p className="mt-2 text-sm font-semibold text-success-strong">Offer</p>
          <p className="mt-1 text-xs text-success-strong">当前 {progress.offer}</p>
        </div>
      </div>

      <div className="md:hidden">
        {stageValues.map((stage, index) => (
          <div key={stage.key}>
            <StageNode count={stage.count} index={index} label={stage.label} />
            <VerticalConnector active={stage.count > 0} />
          </div>
        ))}
        <div className="rounded-lg border border-success/25 bg-success-soft p-3 text-center">
          <CheckCircle2 aria-hidden="true" className="mx-auto size-7 text-success-strong" />
          <p className="mt-2 text-sm font-semibold text-success-strong">Offer</p>
          <p className="mt-1 text-xs text-success-strong">当前 {progress.offer}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed border-danger/25 bg-danger-soft/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CircleX aria-hidden="true" className="size-4 text-danger-strong" />
          <span className="text-sm font-semibold text-danger-strong">已拒绝 {progress.rejected}</span>
        </div>
        <p className="text-xs leading-5 text-danger-strong">当前数据没有记录拒绝发生的具体轮次，因此不将其错误连接到某一面。</p>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        “至少到达”综合岗位当前阶段与真实面试轮次记录，取可确认的较高值；后续轮次会计入此前已到达阶段。
      </p>
    </div>
  );
}
