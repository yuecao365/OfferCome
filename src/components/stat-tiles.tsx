import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import { cn } from "@/lib/cn";

export type StatTile = {
  label: string;
  value: number;
  suffix?: string;
  /** 数字下面一行灰字：口径或变化。 */
  note?: string;
  /** 只给第一张用：数字下面放一个主动作。 */
  action?: ReactNode;
  /**
   * 语义色，只在值大于 0 时点亮：accent（橙）是页面上要你行动的那个数（待跟进、进行中、7 天新增……）；
   * success（绿）是结果好的数（Offer）；info（靛蓝）是在途的数（面试中、待面）。其余保持中性。一排里 accent 最多一张。
   */
  tone?: StatTone;
};

export type StatTone = "accent" | "success" | "info";

const TONE_CARD: Record<StatTone, string> = {
  accent: "bg-accent ring-accent-strong",
  success: "bg-success-soft ring-success/25",
  info: "bg-info-soft ring-info/25",
};
const TONE_TEXT: Record<StatTone, string> = {
  accent: "text-accent-foreground",
  success: "text-success-strong",
  info: "text-info-strong",
};

/** 只有值大于 0 才点亮；0 没什么可强调的。 */
export const toneIf = (value: number, tone: StatTone): StatTone | undefined => (value > 0 ? tone : undefined);
export const accentIf = (value: number): StatTone | undefined => toneIf(value, "accent");

/**
 * 页面首屏指标：等宽白卡一排，第一张是北极星数字（字号大一档）。数据概览、面试工作台、投递、历史面试共用；
 * 层次靠卡片与页底的明度差，不靠边框；一排里最多一张 accent，让"该动手的数"跳出来。
 */
export function StatTiles({ tiles, label = "关键指标" }: { tiles: StatTile[]; label?: string }) {
  return (
    <section aria-label={label} className={cn("grid gap-4 sm:grid-cols-2", tiles.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
      {tiles.map((tile, index) => (
        <Card className={cn("flex flex-col p-5", tile.tone && `shadow-none ring-1 ring-inset ${TONE_CARD[tile.tone]}`)} key={tile.label}>
          <p className={cn("text-[0.8125rem]", tile.tone ? TONE_TEXT[tile.tone] : "text-muted-foreground")}>{tile.label}</p>
          <p className={cn("mt-2 tabular-nums", tile.tone ? TONE_TEXT[tile.tone] : "text-foreground", index === 0 ? "text-display" : "text-3xl font-medium leading-9")}>
            <CountUp value={tile.value} />
            {tile.suffix ? <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">{tile.suffix}</span> : null}
          </p>
          {tile.note ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{tile.note}</p> : null}
          {tile.action ? <div className="mt-auto pt-4">{tile.action}</div> : null}
        </Card>
      ))}
    </section>
  );
}
