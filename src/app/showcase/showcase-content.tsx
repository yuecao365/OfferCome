"use client";

import { ArrowRight, ArrowUpRight, Database, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useCountUp } from "@/lib/use-count-up";

import { showcaseCopy, type Language, type ShowcaseCopy } from "./copy";
import { FeatureRows } from "./feature-rows";
import { LoopDemo } from "./loop-demo";
import { Reveal, useRevealed } from "./reveal";

/** 进入视口后数字从 0 滚到位。 */
function Fact({ value, suffix, label }: ShowcaseCopy["facts"][number]) {
  const { ref, revealed } = useRevealed(0.6);
  const display = useCountUp(revealed ? value : 0, 900);
  return (
    <div className="px-6 first:pl-0 last:pr-0" ref={ref}>
      <p className="text-4xl font-medium tracking-tight tabular-nums text-foreground sm:text-5xl">
        {display}
        <span className="ml-1 text-base font-normal text-muted-foreground">{suffix}</span>
      </p>
      <p className="mt-2 text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
}) {
  return (
    <div className="grid gap-6 border-b border-border pb-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-end">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h2>
      </div>
      {description ? (
        <p className="max-w-xl text-[15px] leading-7 text-muted-foreground lg:justify-self-end">{description}</p>
      ) : null}
    </div>
  );
}

/** 暗色闭环环：四个节点绕成一圈，一个光点沿环持续行进。 */
function LoopRing({ steps }: { steps: ShowcaseCopy["loopSteps"] }) {
  const radius = 120;
  const center = 160;
  const nodes = steps.map((label, index) => {
    const angle = (-90 + index * 90) * (Math.PI / 180);
    return { label, x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  });
  return (
    <svg aria-hidden="true" className="mx-auto h-72 w-72 sm:h-80 sm:w-80" viewBox="0 0 320 320">
      <circle cx={center} cy={center} fill="none" r={radius} stroke="rgb(255 255 255 / 0.12)" strokeWidth={1} />
      <circle
        className="sc-orbit"
        cx={center}
        cy={center}
        fill="none"
        pathLength={1}
        r={radius}
        stroke="var(--brand)"
        strokeLinecap="round"
        strokeWidth={2}
      />
      {nodes.map((node, index) => (
        <g key={node.label}>
          <circle cx={node.x} cy={node.y} fill="#0c0c0d" r={22} stroke="rgb(255 255 255 / 0.14)" strokeWidth={1} />
          <text fill="#ededef" fontSize={12} fontWeight={500} textAnchor="middle" x={node.x} y={node.y + 4}>
            {node.label}
          </text>
          <text fill="#8a8a91" fontFamily="var(--font-mono)" fontSize={10} textAnchor="middle" x={node.x} y={node.y - 30}>
            0{index + 1}
          </text>
        </g>
      ))}
      <circle className="sc-orbit-dot" cx={center} cy={center - radius} fill="var(--brand)" r={4} />
    </svg>
  );
}

export function ShowcaseContent({ displayFontVariable }: { displayFontVariable: string }) {
  const [language, setLanguage] = useState<Language>("zh");
  const content = showcaseCopy[language];
  const localDeployHref =
    language === "zh"
      ? "https://github.com/yuecao365/OfferLai/blob/main/README_CN.md#快速开始"
      : "https://github.com/yuecao365/OfferLai#quick-start";

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  return (
    <main
      className={cn(
        "showcase-light relative min-h-screen overflow-x-clip bg-background font-sans text-foreground",
        displayFontVariable,
      )}
    >
      <div aria-hidden="true" className="sc-dots pointer-events-none absolute inset-x-0 top-0 h-[760px]" />

      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link className="flex items-center gap-1.5 text-sm font-semibold tracking-tight" href="/showcase">
            OfferLai
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
          </Link>
          <nav aria-label={content.navigationLabel} className="flex items-center gap-2">
            <div
              aria-label={language === "zh" ? "切换展示语言" : "Change showcase language"}
              className="inline-flex items-center gap-0.5 rounded-control bg-surface-sunken p-0.5"
              role="group"
            >
              {(["zh", "en"] as const).map((option) => (
                <button
                  aria-pressed={language === option}
                  className={cn(
                    "inline-flex h-7 min-w-8 items-center justify-center rounded-[4px] px-2 text-xs transition-colors duration-150",
                    language === option
                      ? "bg-surface font-medium text-foreground shadow-card"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-shot={option === "en" ? "lang-en" : undefined}
                  key={option}
                  onClick={() => setLanguage(option)}
                  type="button"
                >
                  {option === "zh" ? "中" : "EN"}
                </button>
              ))}
            </div>
            <Link
              className={buttonClassName({ variant: "ghost", className: "hidden md:inline-flex" })}
              href="https://github.com/yuecao365/OfferLai"
            >
              GitHub
              <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            </Link>
            <Link className={buttonClassName()} href="/homepage">
              {content.enterProduct}
              <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            </Link>
          </nav>
        </div>
      </header>

      {/* ============ Hero ============ */}
      <section
        className="relative mx-auto grid max-w-6xl gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16 lg:pb-24 lg:pt-24"
        data-shot="hero"
      >
        <div>
          <h1
            className="text-[52px] font-black leading-[1.12] tracking-tight sm:text-[64px] xl:text-[72px]"
            style={{ fontFamily: "var(--font-sc-display), var(--font-sans, inherit)" }}
          >
            <span className="sc-rise block">{content.heroTitle[0]}</span>
            <span className="sc-rise relative inline-block [animation-delay:100ms]">
              {content.heroTitle[1]}
              <span className="text-brand">。</span>
              <svg
                aria-hidden="true"
                className="sc-chartline absolute -bottom-4 left-1 h-6 w-[102%]"
                fill="none"
                preserveAspectRatio="none"
                viewBox="0 0 360 40"
              >
                <path
                  d="M4 32 L96 26 L188 29 L286 10 L340 14"
                  pathLength="1"
                  stroke="var(--brand)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="4"
                />
                <circle cx="340" cy="14" fill="var(--brand)" r="6" stroke="var(--background)" strokeWidth="3" />
              </svg>
            </span>
          </h1>

          <p className="sc-rise mt-10 max-w-lg text-[17px] leading-8 text-muted-foreground [animation-delay:220ms] [&_b]:font-medium [&_b]:text-foreground">
            {content.heroDescription}
          </p>

          <div className="sc-rise mt-8 flex flex-wrap items-center gap-2.5 [animation-delay:340ms]">
            <Link className={buttonClassName({ className: "h-10 px-5 text-sm" })} href="/homepage">
              {content.experienceProduct}
              <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Link>
            <Link className={buttonClassName({ variant: "outline", className: "h-10 px-5 text-sm" })} href={localDeployHref}>
              {content.localDeploy}
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Link>
          </div>

          <ul className="sc-rise mt-6 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground [animation-delay:440ms]">
            {content.trustPoints.map((point, index) => (
              <li className="inline-flex items-center gap-1.5" key={point}>
                {index === 0 ? (
                  <ShieldCheck aria-hidden="true" className="size-3.5 text-brand" strokeWidth={1.5} />
                ) : (
                  <span aria-hidden="true" className="size-1 rounded-full bg-border-strong" />
                )}
                {point}
              </li>
            ))}
          </ul>
        </div>

        <LoopDemo copy={content.demo} label={content.demoLabel} scenes={content.scenes} />
      </section>

      {/* ============ 三个事实 ============ */}
      <section className="relative mx-auto max-w-6xl px-5 pb-24 sm:px-8 lg:pb-32">
        <Reveal>
          <div className="flex flex-col divide-y divide-border border-y border-border py-8 sm:flex-row sm:divide-x sm:divide-y-0">
            {content.facts.map((fact) => (
              <Fact key={fact.label} {...fact} />
            ))}
          </div>
        </Reveal>
      </section>

      {/* ============ 功能：一个闭环，五个环节 ============ */}
      <section className="relative mx-auto max-w-6xl px-5 pb-24 sm:px-8 lg:pb-32">
        <Reveal>
          <SectionHeading
            description={content.highlightsDescription}
            eyebrow={content.highlightsEyebrow}
            title={
              <>
                {content.highlightsTitle[0]}
                <br />
                {content.highlightsTitle[1]}
              </>
            }
          />
        </Reveal>
        <div className="mt-12">
          <FeatureRows copy={content} />
        </div>
      </section>

      {/* ============ 闭环（暗色带） ============ */}
      <section className="relative border-y border-border bg-[#0c0c0d] text-[#ededef]">
        <div className="sc-dots-dark pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-28">
          <Reveal>
            <p className="font-mono text-xs text-[#8a8a91]">{content.loopEyebrow}</p>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">{content.loopTitle}</h2>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#8a8a91]">{content.loopDescription}</p>
            <Link
              className={buttonClassName({ className: "mt-8 h-10 px-5 text-sm" })}
              href="/interviews/mock"
            >
              {content.experienceProduct}
              <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Link>
          </Reveal>
          <Reveal delay={120}>
            <LoopRing steps={content.loopSteps} />
          </Reveal>
        </div>
      </section>

      {/* ============ 边界 ============ */}
      <section className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <Reveal>
          <p className="font-mono text-xs text-muted-foreground">{content.privacyEyebrow}</p>
          <div className="mt-4 grid gap-10 border-t border-border pt-8 md:grid-cols-2">
            {content.privacy.map((item, index) => {
              const Icon = index === 0 ? Database : ShieldCheck;
              return (
                <div className="flex gap-4" key={item.title}>
                  <Icon aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  <div>
                    <h2 className="text-base font-semibold tracking-tight">{item.title}</h2>
                    <p className="mt-2 max-w-md text-[15px] leading-7 text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <Reveal>
          <div className="dot-grid flex flex-col gap-8 rounded-panel border border-border bg-surface p-8 sm:p-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-2xl text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">{content.ctaTitle}</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{content.ctaDescription}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2.5">
              <Link className={buttonClassName({ className: "h-10 px-5 text-sm" })} href="/homepage">
                {content.enterExperience}
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </Link>
              <Link
                className={buttonClassName({ variant: "outline", className: "h-10 px-5 text-sm" })}
                href="https://github.com/yuecao365/OfferLai"
              >
                {content.viewSource}
                <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="relative border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 font-mono text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>OfferLai · {content.footerNote}</span>
          <Link className="hover:text-foreground" href="https://github.com/yuecao365/OfferLai">
            github.com/yuecao365/OfferLai
          </Link>
        </div>
      </footer>
    </main>
  );
}
