"use client";

import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/client";
import type { InterviewStatus } from "@/lib/interviews/types";
import { statusLabel } from "@/lib/interviews/types";

const tones: Record<InterviewStatus, "brand" | "info" | "success"> = {
  scheduled: "brand",
  in_progress: "info",
  completed: "success",
};

export function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  const locale = useLocale();
  return <Badge tone={tones[status]}>{statusLabel(status, locale)}</Badge>;
}
