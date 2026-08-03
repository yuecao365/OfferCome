import { Badge } from "@/components/ui/badge";
import { type ApplicationStage, stageLabel } from "@/lib/applications/types";

type StageBadgeProps = {
  stage: ApplicationStage;
};

const stageTones: Record<
  ApplicationStage,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  applied: "neutral",
  assessment: "warning",
  first_interview: "info",
  second_interview: "info",
  third_interview: "info",
  hr_interview: "info",
  offer: "success",
  rejected: "danger",
};

export function StageBadge({ stage }: StageBadgeProps) {
  return (
    <Badge tone={stageTones[stage]}>
      {stageLabel(stage)}
    </Badge>
  );
}
