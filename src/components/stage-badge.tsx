"use client";

import { Badge } from "@/components/ui/badge";
import { APPLICATION_STAGE_LABELS_I18N, type ApplicationStage } from "@/lib/applications/types";
import { useLocale } from "@/lib/i18n/client";

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
  const locale = useLocale();
  return (
    <Badge tone={stageTones[stage]}>
      {APPLICATION_STAGE_LABELS_I18N[locale][stage]}
    </Badge>
  );
}
