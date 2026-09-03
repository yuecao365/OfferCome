"use client";

import { ArrowRight, FileAudio, FileText, Mic } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import type { ShowcaseCopy } from "./copy";

/** 三张 2x 局部裁切图对应的功能序号，其余两个功能用现场渲染的小场景。 */
const featureImages: Record<number, string> = {
  0: "/showcase/detail-applications.png",
  2: "/showcase/detail-mock.png",
  4: "/showcase/detail-profile.png",
};

function DetailFrame({ src, alt, active }: { src: string; alt: string; active: boolean }) {
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-[#0c0c0d] shadow-raised">
      <Image
        alt={alt}
        className={cn("block h-auto w-full transition-transform duration-700 ease-app", active ? "scale-100" : "scale-[1.02]")}
        height={1000}
        quality={90}
        sizes="(max-width: 1024px) 100vw, 680px"
        src={src}
        width={1600}
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

/**
 * 功能区：左侧五段文字随滚动逐段点亮，右侧视觉粘在视口里随之切换。
 * 小屏退化为逐段堆叠，每段自带视觉。
 */
export function FeatureScroll({ copy }: { copy: ShowcaseCopy }) {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isNaN(index)) setActive(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const node of stepRefs.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visualFor = (index: number, isActive: boolean) => {
    const feature = copy.features[index];
    if (index === 1) return <SkillTicker topics={copy.skillTopics} />;
    if (index === 3) return <IntakeFlow active={isActive} result={copy.intakeResult} types={copy.intakeTypes} />;
    return <DetailFrame active={isActive} alt={feature.title} src={featureImages[index]!} />;
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <ol className="grid gap-6 lg:gap-0">
        {copy.features.map((feature, index) => {
          const isActive = index === active;
          return (
            <li key={feature.title}>
              <div
                className={cn(
                  "border-l-2 py-6 pl-6 transition-colors duration-300 lg:py-10",
                  isActive ? "border-brand" : "border-border",
                )}
                data-index={index}
                ref={(node) => {
                  stepRefs.current[index] = node;
                }}
              >
                <button
                  className="block w-full text-left"
                  onClick={() => {
                    setActive(index);
                    stepRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  type="button"
                >
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                  <h3
                    className={cn(
                      "mt-3 text-xl font-semibold tracking-tight transition-colors duration-300 sm:text-2xl",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {feature.title}
                  </h3>
                </button>
                <p
                  className={cn(
                    "mt-3 max-w-md text-[15px] leading-7 transition-opacity duration-300",
                    isActive ? "text-muted-foreground opacity-100" : "text-muted-foreground opacity-60",
                  )}
                >
                  {feature.description}
                </p>
                <div className="mt-6 lg:hidden">{visualFor(index, true)}</div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="relative hidden lg:block">
        <div className="sticky top-24">
          {copy.features.map((feature, index) => {
            const isActive = index === active;
            return (
              <div
                aria-hidden={!isActive}
                className={cn(
                  "transition-[opacity,transform] duration-500 ease-app",
                  isActive ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0 translate-y-3",
                )}
                key={feature.title}
              >
                {visualFor(index, isActive)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
