import type { ReactNode } from "react";

import { CountUp } from "@/components/ui/count-up";

export type HeroTile = {
  label: string;
  value: number;
  suffix?: string;
};

/**
 * 页面首屏焦点：一个北极星数字 + 右侧无框指标条（发丝线分隔）。
 * 数据概览与面试工作台共用。
 */
export function StatHero({
  value,
  label,
  badge,
  note,
  action,
  tiles,
}: {
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
      className="grid gap-8 border-b border-border pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
    >
      <div>
        <p className="text-[0.8125rem] text-muted-foreground">{label}</p>
        <p className="mt-1 text-display tabular-nums text-foreground">
          <CountUp value={value} />
        </p>
        {badge || note ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
            {badge}
            {note ? <span>{note}</span> : null}
          </p>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
      <dl className="flex divide-x divide-border">
        {tiles.map((tile) => (
          <div className="min-w-28 px-6 first:pl-0 last:pr-0" key={tile.label}>
            <dt className="text-xs text-muted-foreground">{tile.label}</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums leading-8 text-foreground">
              <CountUp value={tile.value} />
              {tile.suffix ? (
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                  {tile.suffix}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
