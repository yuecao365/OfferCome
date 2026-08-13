import { Badge } from "@/components/ui/badge";

export function evidencePolarityContainerClass(polarity: string): string {
  return polarity === "contradicts"
    ? "border-warning/40 bg-warning-soft/40"
    : "border-border";
}

export function EvidencePolarityBadge({ polarity }: { polarity: string }) {
  return polarity === "contradicts" ? (
    <Badge tone="warning">反向证据</Badge>
  ) : (
    <Badge>支持证据</Badge>
  );
}
