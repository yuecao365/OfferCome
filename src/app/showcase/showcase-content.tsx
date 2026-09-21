"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { showcaseCopy, type Language, type ShowcaseCopy } from "./copy";
import { InterviewReplay } from "./interview-replay";
import { replayScripts, reportExcerpts, type ReplayLine } from "./replay-data";
import { Reveal } from "./reveal";

/**
 * 宣传页。叙事只有一件事：一个会追问的面试官，面完给能回到原话的评分卡。
 * 配色是纸与墨（深松 / 板岩青 / 鼠尾草 / 薄荷 / 纸白），页面上不出现产品的翡翠绿；见 globals.css 的 .showcase-light。
 * 不放营销数字、跑马灯、点阵背景；动效只有首屏回放与进入视口的一次淡入。
 */

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: ReactNode; description?: string }) {
  return (
    <div className="grid gap-6 border-b border-border pb-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-end">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{eyebrow}</p>
        <h2 className="sc-display mt-3 text-3xl leading-tight tracking-tight sm:text-[38px]">{title}</h2>
      </div>
      {description ? <p className="max-w-xl text-base leading-7 text-muted-foreground lg:justify-self-end">{description}</p> : null}
    </div>
  );
}

/** 三张"你说 → 它接着问 → 它为什么这么问"。 */
function AskCards({ copy, lines }: { copy: ShowcaseCopy; lines: ReplayLine[] }) {
  return (
    <ol className="grid gap-4 lg:grid-cols-3">
      {copy.askCards.map((index) => {
        const you = lines[index];
        const it = lines[index + 1];
        if (!you || you.role !== "candidate" || !it || it.role !== "interviewer") return null;
        return (
          <li className="grid content-start gap-4 rounded-panel border border-border bg-surface p-5" key={index}>
            <div>
              <p className="font-mono text-[11px] text-muted-foreground">{copy.replay.youSaid}</p>
              <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{you.text}</p>
            </div>
            <div className="border-t border-border pt-4">
              <p className="font-mono text-[11px] text-muted-foreground">{copy.replay.itAsked}</p>
              <p className="mt-1.5 text-[15px] leading-7 text-foreground">{it.text}</p>
            </div>
            <div className="rounded-control px-3 py-2.5" style={{ background: "var(--accent)" }}>
              <p className="font-mono text-[11px] text-accent-foreground">{copy.replay.why}</p>
              <p className="mt-1 text-[13px] leading-6 text-foreground">{it.why}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** 报告节选：用与产品同一套排法现场渲染，不放截图。 */
function ReportExcerpt({ copy, language }: { copy: ShowcaseCopy; language: Language }) {
  const report = reportExcerpts[language];
  const labels = copy.reportLabels;
  return (
    <div className="rounded-panel border border-border bg-surface p-5 sm:p-6">
      <div className="grid gap-6 border-b border-border pb-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
        <div>
          <p className="text-[13px] text-muted-foreground">{labels.score}</p>
          <p className="sc-display mt-1 text-5xl tabular-nums text-foreground">
            {report.score}
            <span className="ml-1 font-sans text-sm font-normal tracking-normal text-muted-foreground">/ 100</span>
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{labels.summary}</p>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{report.summary}</p>
        </div>
      </div>
      <div className="mt-5">
        <p className="text-sm font-semibold text-foreground">{labels.weaknesses}</p>
        <ul className="mt-3 grid gap-3">
          {report.weaknesses.map((item) => (
            <li className="grid gap-1 text-[13px] leading-6" key={item.point}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded-control border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{item.kind}</span>
                <span className="text-foreground">{item.point}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{item.area}</span>
              </div>
              <p className="pl-1 text-muted-foreground">
                {labels.practice}：{item.practice}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-5 border-t border-border pt-5">
        <p className="text-sm font-semibold text-foreground">{labels.hypotheses}</p>
        <div className="mt-3 flex flex-wrap items-start gap-2 text-[13px] leading-6">
          <span className="rounded-control px-1.5 py-0.5 font-mono text-[11px] text-accent-foreground" style={{ background: "var(--accent)" }}>
            {report.hypothesis.status}
          </span>
          <p className="text-foreground">{report.hypothesis.text}</p>
        </div>
        <p className="mt-1 pl-1 text-[13px] leading-6 text-muted-foreground">{report.hypothesis.verdict}</p>
      </div>
      <p className="mt-5 font-mono text-[11px] text-muted-foreground">{labels.footer}</p>
    </div>
  );
}

function Figures({ items }: { items: ShowcaseCopy["figures"] }) {
  return (
    <ul className="grid gap-6">
      {items.map((figure) => (
        <li className="border-t border-border pt-5" key={figure.label}>
          <p className="sc-display text-3xl tabular-nums text-foreground sm:text-4xl">{figure.value}</p>
          <p className="mt-2 text-[15px] leading-6 text-foreground">{figure.label}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{figure.note}</p>
        </li>
      ))}
    </ul>
  );
}

export function ShowcaseContent({ displayFontVariable }: { displayFontVariable: string }) {
  const [language, setLanguage] = useState<Language>("zh");
  const content = showcaseCopy[language];
  const script = replayScripts[language];
  const localDeployHref =
    language === "zh" ? "https://github.com/yuecao365/OfferCome/blob/main/README_CN.md#快速开始" : "https://github.com/yuecao365/OfferCome#quick-start";

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  return (
    <main className={cn("showcase-light relative min-h-screen overflow-x-clip bg-background font-sans text-foreground", displayFontVariable)}>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link className="sc-display text-[15px] tracking-tight" href="/showcase">
            OfferCome
          </Link>
          <nav aria-label={content.navigationLabel} className="flex items-center gap-2">
            <div aria-label={language === "zh" ? "切换展示语言" : "Change showcase language"} className="inline-flex items-center gap-0.5 rounded-control bg-surface-sunken p-0.5" role="group">
              {(["zh", "en"] as const).map((option) => (
                <button
                  aria-pressed={language === option}
                  className={cn(
                    "inline-flex h-7 min-w-8 items-center justify-center rounded-[4px] px-2 text-xs transition-colors duration-150",
                    language === option ? "bg-surface font-medium text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                  )}
                  key={option}
                  onClick={() => setLanguage(option)}
                  type="button"
                >
                  {option === "zh" ? "中" : "EN"}
                </button>
              ))}
            </div>
            <Link className={buttonClassName({ variant: "ghost", className: "hidden md:inline-flex" })} href="https://github.com/yuecao365/OfferCome">
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

      {/* ============ 首屏：一句话 + 真实回放 ============ */}
      <section className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-20 lg:pb-28 lg:pt-20">
        <div>
          <h1 className="sc-display text-[48px] leading-[1.12] tracking-tight sm:text-[64px] xl:text-[76px]">
            <span className="sc-rise block">{content.heroTitle[0]}</span>
            <span className="sc-rise block [animation-delay:100ms]">
              {content.heroTitle[1]}
              <span style={{ color: "var(--brand)" }}>。</span>
            </span>
          </h1>
          <p className="sc-rise mt-8 max-w-xl text-lg leading-8 text-muted-foreground [animation-delay:220ms] [&_b]:font-medium [&_b]:text-foreground">{content.heroDescription}</p>
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
          <ul className="sc-rise mt-6 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground [animation-delay:440ms]">
            {content.trustPoints.map((point) => (
              <li className="inline-flex items-center gap-1.5" key={point}>
                <span aria-hidden="true" className="size-1 rounded-full bg-border-strong" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <InterviewReplay key={language} label={content.replay.label} note={content.replay.excerptNote} script={script} whyLabel={content.replay.why} />
      </section>

      {/* ============ 它怎么问 ============ */}
      <section className="relative mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28">
        <Reveal>
          <SectionHeading description={content.askDescription} eyebrow={content.askEyebrow} title={content.askTitle} />
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-10">
            <AskCards copy={content} lines={script.lines} />
          </div>
        </Reveal>
      </section>

      {/* ============ 面完你拿到什么 ============ */}
      <section className="relative border-y border-border bg-surface-subtle">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <Reveal>
            <SectionHeading description={content.reportDescription} eyebrow={content.reportEyebrow} title={content.reportTitle} />
          </Reveal>
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:gap-16">
            <Reveal delay={80}>
              <ReportExcerpt copy={content} language={language} />
            </Reveal>
            <Reveal delay={160}>
              <Figures items={content.figures} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ 闭环 + 边界 ============ */}
      <section className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <SectionHeading description={content.loopDescription} eyebrow={content.loopEyebrow} title={content.loopTitle} />
        </Reveal>
        <Reveal delay={80}>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-panel border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {content.loopSteps.map((step, index) => (
              <li className="grid content-start gap-2 bg-surface p-5" key={step.title}>
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                <span className="text-base font-semibold tracking-tight text-foreground">{step.title}</span>
                <span className="text-[13px] leading-6 text-muted-foreground">{step.description}</span>
              </li>
            ))}
          </ol>
        </Reveal>
        <Reveal delay={140}>
          <div className="mt-12">
            <p className="font-mono text-xs text-muted-foreground">{content.privacyEyebrow}</p>
            <div className="mt-4 grid gap-8 border-t border-border pt-6 md:grid-cols-2">
              {content.privacy.map((item) => (
                <div key={item.title}>
                  <h3 className="text-base font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-2 max-w-md text-[15px] leading-7 text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <Reveal>
          <div className="flex flex-col gap-8 rounded-panel border border-border bg-surface p-8 sm:p-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="sc-display max-w-2xl text-2xl leading-snug tracking-tight sm:text-3xl">{content.ctaTitle}</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{content.ctaDescription}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2.5">
              <Link className={buttonClassName({ className: "h-10 px-5 text-sm" })} href="/homepage">
                {content.enterExperience}
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </Link>
              <Link className={buttonClassName({ variant: "outline", className: "h-10 px-5 text-sm" })} href="https://github.com/yuecao365/OfferCome">
                {content.viewSource}
                <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="relative border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 font-mono text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>OfferCome · {content.footerNote}</span>
          <Link className="hover:text-foreground" href="https://github.com/yuecao365/OfferCome">
            github.com/yuecao365/OfferCome
          </Link>
        </div>
      </footer>
    </main>
  );
}
