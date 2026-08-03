import { Badge } from "@/components/ui/badge";
import type { InterviewStatus } from "@/lib/interviews/types";
import { statusLabel } from "@/lib/interviews/types";

const tones: Record<InterviewStatus, "info" | "success"> = {
  in_progress: "info",
  completed: "success",
};

export function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  return <Badge tone={tones[status]}>{statusLabel(status)}</Badge>;
}
