import type { CSSProperties } from "react";

/** recharts 共用主题：等宽刻度、无网格线、发丝线 tooltip，与整体 token 一致。 */
export const chartAxisTick = {
  fill: "var(--muted-foreground)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};

export const chartTooltipStyle: CSSProperties = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  boxShadow: "var(--app-shadow-raised)",
  color: "var(--foreground)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  padding: "6px 8px",
};
