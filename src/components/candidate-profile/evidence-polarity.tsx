"use client";

import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": { contradicts: "反向证据", supports: "支持证据" },
  en: { contradicts: "Contradicting evidence", supports: "Supporting evidence" },
});

export function evidencePolarityContainerClass(polarity: string): string {
  return polarity === "contradicts"
    ? "border-warning/40 bg-warning-soft/40"
    : "border-border";
}

export function EvidencePolarityBadge({ polarity }: { polarity: string }) {
  const t = useMessages(messages);
  return polarity === "contradicts" ? (
    <Badge tone="warning">{t.contradicts}</Badge>
  ) : (
    <Badge>{t.supports}</Badge>
  );
}
