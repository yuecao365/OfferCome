"use client";

import { ArrowRight, FileAudio, FileText, Mic } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/cn";

import type { ShowcaseCopy } from "./copy";
import { useRevealed } from "./reveal";

/** 三张 2x 局部裁切图对应的功能序号，其余两个功能用现场渲染的小场景。 */
const featureImages: Record<number, string> = {
  0: "/showcase/detail-applications.png",
  2: "/showcase/detail-mock.png",
  4: "/showcase/detail-profile.png",
};

function DetailFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-[#0c0c0d] shadow-raised">
      <Image
        alt={alt}
        className="block h-auto w-full"
        height={900}
        quality={92}
        sizes="(max-width: 1024px) 100vw, 720px"
        src={src}
        width={1200}
      />
    </div>
  );
}

/** 技能包：两行反向滚动的主题带，悬停暂停。 */
function SkillTicker({ topics }: { topics: readonly string[] }) {
  const rows = [topics, [...topics].reverse()];
  return (
    <div className="grid gap-3 overflow-hidden rounded-panel border border-border bg-surface p-5 [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
      {rows.map((row, rowIndex) => (
        <div className="sc-ticker flex gap-2" data-reverse={rowIndex === 1 ? "" : undefined} key={rowIndex}>
          {[...row, ...row].map((topic, index) => (
            <span
              className="shrink-0 rounded-control border border-border bg-surface-subtle px-3 py-1.5 font-mono text-xs text-foreground"
              key={`${topic}-${index}`}
            >
              {topic}
            </span>
          ))}
        </div>
      ))}
      <p className="mt-1 text-xs text-muted-foreground">高频主题 · 深度阶梯 · 项目追问链</p>
    </div>
  );
}

/** 面试记录投入：四种材料落进去，出来公司岗位轮次与问答草稿。 */
function IntakeFlow({
  types,
  result,
  active,
}: {
  types: ShowcaseCopy["intakeTypes"];
  result: ShowcaseCopy["intakeResult"];
  active: boolean;
}) {
  const icons = [Mic, FileText, FileAudio, FileText] as const;
  return (
    <div className="grid gap-4 rounded-panel border border-border bg-surface p-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <ul className="grid grid-cols-2 gap-2">
        {types.map((type, index) => {
          const Icon = icons[index];
          return (
            <li
              className={cn(
                "flex items-center gap-2 rounded-control border border-dashed border-border-strong px-3 py-2 text-xs text-foreground sc-row",
                active && "sc-row-in",
              )}
              key={type}
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
              {type}
            </li>
          );
        })}
      </ul>
      <ArrowRight aria-hidden="true" className="mx-auto size-4 text-muted-foreground" strokeWidth={1.5} />
      <ul className="grid gap-1.5">
        {result.map((item, index) => (
          <li
            className={cn("rounded-control bg-surface-subtle px-3 py-2 font-mono text-[11px] text-foreground sc-row", active && "sc-row-in")}
            key={item}
            style={{ animationDelay: `${600 + index * 140}ms` }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureVisual({ copy, index, active }: { copy: ShowcaseCopy; index: number; active: boolean }) {
  const feature = copy.features[index];
  if (index === 1) return <SkillTicker topics={copy.skillTopics} />;
  if (index === 3) return <IntakeFlow active={active} result={copy.intakeResult} types={copy.intakeTypes} />;
  return <DetailFrame alt={feature.title} src={featureImages[index]!} />;
}

function FeatureRow({ copy, index }: { copy: ShowcaseCopy; index: number }) {
  const feature = copy.features[index];
  const { ref, revealed } = useRevealed<HTMLLIElement>(0.25);
  const reversed = index % 2 === 1;
  return (
    <li
      // 列一律 minmax(0, …)：否则小屏上图片会按原始宽度把列撑开，被 overflow clip 裁成空白
      className="sc-reveal grid grid-cols-[minmax(0,1fr)] items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16"
      data-revealed={revealed ? "true" : undefined}
      ref={ref}
    >
      <div className={cn("border-l-2 border-brand pl-6", reversed && "lg:order-2")}>
        <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[28px]">{feature.title}</h3>
        <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">{feature.description}</p>
      </div>
      <div className={cn("min-w-0", reversed && "lg:order-1")}>
        <FeatureVisual active={revealed} copy={copy} index={index} />
      </div>
    </li>
  );
}

/**
 * 功能区：每个功能一行，文字与视觉左右交替；整行进入视口时一起淡入。
 * 不做滚动联动切换，段落之间不会跳。
 */
export function FeatureRows({ copy }: { copy: ShowcaseCopy }) {
  return (
    <ol className="grid gap-16 lg:gap-20">
      {copy.features.map((feature, index) => (
        <FeatureRow copy={copy} index={index} key={feature.title} />
      ))}
    </ol>
  );
}
