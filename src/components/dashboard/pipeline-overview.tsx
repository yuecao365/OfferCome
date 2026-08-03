import type { ApplicationStage } from "@/lib/applications/types";
import { stageLabel } from "@/lib/applications/types";

const pipelineStages: ApplicationStage[] = [
  "applied",
  "assessment",
  "first_interview",
  "second_interview",
  "third_interview",
  "hr_interview",
  "offer",
];

export function PipelineOverview({
  counts,
  total,
}: {
  counts: Record<ApplicationStage, number>;
  total: number;
}) {
  const max = Math.max(1, ...pipelineStages.map((stage) => counts[stage]));

  return (
    <div className="grid gap-3">
      {pipelineStages.map((stage) => {
        const count = counts[stage];
        const width = count === 0 ? 0 : Math.max(6, (count / max) * 100);
        return (
          <div className="grid grid-cols-[88px_minmax(0,1fr)_36px] items-center gap-3" key={stage}>
            <span className="text-xs font-medium text-muted-foreground">
              {stageLabel(stage)}
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                aria-hidden="true"
                className="h-full rounded-full bg-brand transition-[width] duration-500"
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="text-right text-sm font-semibold text-foreground">{count}</span>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">
        各阶段为当前状态快照，不代表严格的逐级转化率。共 {total} 条投递记录。
      </p>
    </div>
  );
}
