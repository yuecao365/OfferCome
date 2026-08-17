import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CountUp } from "@/components/ui/count-up";

export type HeroTile = {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
};

function Tile({ icon: Icon, label, value, suffix }: HeroTile) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface-subtle/60 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5 text-brand" />
        {label}
      </div>
      <p className="mt-2 text-display tabular-nums text-foreground">
        <CountUp value={value} />
        {suffix ? <span className="ml-0.5 text-sm font-medium text-muted-foreground">{suffix}</span> : null}
      </p>
    </div>
  );
}

/**
 * 页面首屏焦点块：超大主指标 + 右侧指标瓦片，配品牌色渐变底与微光晕。
 * 数据概览与面试工作台共用。
 */
export function StatHero({
  eyebrow,
  value,
  label,
  badge,
  note,
  action,
  tiles,
}: {
  eyebrow: string;
  value: number;
  label: string;
  badge?: ReactNode;
  note?: string;
  action?: ReactNode;
  tiles: HeroTile[];
}) {
  return (
    <section
      aria-label="关键指标"
      className="stat-hero grid gap-6 rounded-2xl border border-border p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
          {eyebrow}
        </p>
        <p className="mt-3 flex items-baseline gap-3">
          <span className="text-[3.5rem] font-semibold leading-none tracking-[-0.04em] tabular-nums text-foreground sm:text-[4.5rem]">
            <CountUp value={value} />
          </span>
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </p>
        {badge || note ? (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {badge}
            {note ? <span>{note}</span> : null}
          </p>
        ) : null}
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </div>
    </section>
  );
}
