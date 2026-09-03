"use client";

import { ArrowRight, ArrowUpRight, Database, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Language = "zh" | "en";

type Feature = { title: string; description: string };

type ShowcaseCopy = {
  navigationLabel: string;
  enterProduct: string;
  heroTitle: readonly [string, string];
  heroDescription: ReactNode;
  experienceProduct: string;
  localDeploy: string;
  trustPoints: readonly [string, string, string];
  loopSteps: readonly [string, string, string, string];
  loopNote: string;
  frame: {
    address: string;
    scoreTitle: string;
    scoreDetail: string;
    syncToast: string;
  };
  highlightsEyebrow: string;
  highlightsTitle: readonly [string, string];
  highlightsDescription: string;
  features: readonly [Feature, Feature, Feature, Feature, Feature];
  privacyEyebrow: string;
  privacy: readonly [Feature, Feature];
  ctaTitle: string;
  ctaDescription: string;
  enterExperience: string;
  viewSource: string;
  footerNote: string;
};

const copy = {
  zh: {
    navigationLabel: "展示页导航",
    enterProduct: "进入产品",
    heroTitle: ["每一场面试，", "都算数"],
    heroDescription: (
      <>
        开源，数据全部留在本机。OfferLai 把<b>投递、面试、复盘</b>
        沉淀成你的<b>能力画像</b>，让下一场永远比上一场准备得更好。
      </>
    ),
    experienceProduct: "在线体验真实产品",
    localDeploy: "本地部署",
    trustPoints: ["数据默认留在本机", "在线体验数据只存你的浏览器", "敏感自动化仅本地运行"],
    loopSteps: ["投递", "面试", "复盘", "画像"],
    loopNote: "画像反过来决定下一场模拟面试的出题重点，这是一个闭环。",
    frame: {
      address: "localhost:3000 / 数据概览",
      scoreTitle: "AI 模拟面试 · 报告",
      scoreDetail: "逐题证据评分，已汇入能力画像",
      syncToast: "已同步 3 条新投递 · boss_zhipin",
    },
    highlightsEyebrow: "一个闭环，五个环节",
    highlightsTitle: ["不只是记录，", "而是积累可复用的求职经验。"],
    highlightsDescription:
      "从导入已有投递，到用技能包和你的经历生成下一场模拟面试，再到能力画像长期更新，每个环节的产出都会成为下一个环节的输入。",
    features: [
      {
        title: "投递记录，一键进入工作台",
        description:
          "驱动本机浏览器导入 Boss 直聘上已有的投递，自动去重并突出新增与状态变化；久无回音的岗位会在同步时被标记。登录与验证码始终由你本人完成，系统只读不投。",
      },
      {
        title: "技能包出题，问到点子上",
        description:
          "面试经验沉淀为分层技能包，涵盖高频主题、深度阶梯与项目追问链。AI 按岗位和你的简历自行取用，出的是带场景的题，而不是「谈谈你对 X 的理解」。",
      },
      {
        title: "模拟面试，带着你的经历开始",
        description:
          "结合所选简历、项目、历史面试问答与当前能力画像生成题目，逐题按出题时就定好的标准评分，报告给到证据、优势、改进方向和行动计划。",
      },
      {
        title: "面试记录，投进来就行",
        description:
          "录音、逐字稿、复盘总结、PDF 或 Word 直接投入，材料类型、录音里谁是你、公司岗位轮次全部自动识别，生成可编辑的问答草稿。",
      },
      {
        title: "能力画像，像教练一样反馈",
        description:
          "第一场面试后就给出「继续保持」与「值得再练」，能力归为内容力、证据力与表达力三组，每条洞察都由你回答中的原文支撑，弱项可一键生成针对性训练。",
      },
    ],
    privacyEyebrow: "边界",
    privacy: [
      {
        title: "数据属于用户，而不是平台",
        description:
          "正式使用时，SQLite 数据库、简历文件与 Boss 浏览器状态保存在用户自己的设备中，不进入 OfferLai 中央数据库。",
      },
      {
        title: "自动化有边界，安全校验不绕过",
        description:
          "Boss 登录、扫码、验证码与安全校验始终由用户本人完成；系统只读取已有记录，不自动投递，也不发送消息。",
      },
    ],
    ctaTitle: "先在线浏览完整产品，再把数据留在自己的设备上。",
    ctaDescription: "在线体验的数据只保存在你的浏览器，AI 使用你自己的 API Key，服务器不存储。",
    enterExperience: "进入在线体验",
    viewSource: "查看源码",
    footerNote: "Local-first career workspace",
  },
  en: {
    navigationLabel: "Showcase navigation",
    enterProduct: "Open product",
    heroTitle: ["Every interview", "counts"],
    heroDescription: (
      <>
        Open source, local-first. OfferLai turns <b>applications, interviews
        and reviews</b> into a living <b>capability profile</b>, so every next
        interview starts better prepared than the last.
      </>
    ),
    experienceProduct: "Explore the real product",
    localDeploy: "Run locally",
    trustPoints: [
      "Data stays on your device",
      "Online trial keeps data in your browser",
      "Sensitive automation runs locally",
    ],
    loopSteps: ["Apply", "Interview", "Review", "Profile"],
    loopNote:
      "The profile then decides what your next mock interview drills. A closed loop.",
    frame: {
      address: "localhost:3000 / dashboard",
      scoreTitle: "Mock interview · report",
      scoreDetail: "Scored per question, merged into your profile",
      syncToast: "3 new applications synced · boss_zhipin",
    },
    highlightsEyebrow: "One loop, five stages",
    highlightsTitle: [
      "More than a tracker.",
      "A reusable record of your career growth.",
    ],
    highlightsDescription:
      "From importing existing applications to generating the next mock interview from skill packs and your own history, every stage produces evidence that makes the next one sharper.",
    features: [
      {
        title: "Bring your applications in with one click",
        description:
          "Drive a local browser to import your existing Boss Zhipin records, deduplicate them, and surface what is new or changed. Applications idle too long get flagged during a sync. Login and CAPTCHAs stay with you; OfferLai reads, never applies.",
      },
      {
        title: "Skill packs that ask the right questions",
        description:
          "Interview know-how is captured in layered skill packs covering high-frequency topics, depth ladders, and project follow-up chains. The AI loads what fits the role and your resume, so questions stay concrete instead of asking you to “talk about your understanding of X”.",
      },
      {
        title: "Start mock interviews with your own memory",
        description:
          "Questions come from your selected resume, projects, past answers, and current profile insights. Each one is scored against a rubric written when the question was, and the report gives evidence, strengths, gaps, and an action plan.",
      },
      {
        title: "Just drop your interview in",
        description:
          "Audio, transcripts, review notes, PDF or Word. OfferLai works out the material type, which voice is yours, and the company, role and round, then hands you an editable draft.",
      },
      {
        title: "A capability profile that coaches you",
        description:
          "From your very first interview you get what to keep doing and what to practise, grouped into content, evidence, and delivery. Every insight is backed by your own words, and any weak spot turns into targeted practice with one click.",
      },
    ],
    privacyEyebrow: "Boundaries",
    privacy: [
      {
        title: "Your data belongs to you, not the platform",
        description:
          "In normal use, the SQLite database, resume files, and Boss browser state remain on your own device instead of an OfferLai-hosted central database.",
      },
      {
        title: "Automation has explicit safety boundaries",
        description:
          "You complete Boss login, QR codes, CAPTCHAs, and security checks yourself. OfferLai reads existing records only; it never applies or sends messages for you.",
      },
    ],
    ctaTitle:
      "Explore the complete product online, then keep your own data on your device.",
    ctaDescription:
      "The online trial stores data only in your browser and uses your own API key; the server keeps nothing.",
    enterExperience: "Open live preview",
    viewSource: "View source",
    footerNote: "Local-first career workspace",
  },
} satisfies Record<Language, ShowcaseCopy>;

/** 功能区排版：三大（配截图）+ 两小（纯文字），顺序沿闭环叙事。 */
const featureLayout = [
  { kind: "big", index: 0, image: "/showcase/applications.png" },
  { kind: "compact", indexes: [1, 3] },
  { kind: "big", index: 2, image: "/showcase/mock-interview.png" },
  { kind: "big", index: 4, image: "/showcase/ability-profile.png" },
] as const;

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.dataset.revealed = "true";
            observer.disconnect();
          }
        }
      },
      { threshold: 0.18 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn("sc-reveal", className)}
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** 浏览器窗框：发丝线 + 三个单色圆点 + 等宽地址，里面放真实产品截图。 */
function BrowserFrame({
  address,
  children,
  className,
}: {
  address: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-panel border border-border bg-surface shadow-raised",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-subtle px-3.5 py-2.5">
        <span className="size-2 rounded-full bg-border-strong" />
        <span className="size-2 rounded-full bg-border-strong" />
        <span className="size-2 rounded-full bg-border-strong" />
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{address}</span>
      </div>
      {children}
    </div>
  );
}

/** 主视觉：真实的数据概览截图 + 一张报告小卡 + 一条同步提示。 */
function HeroVisual({ frame }: { frame: ShowcaseCopy["frame"] }) {
  return (
    <div aria-hidden="true" className="relative hidden lg:block">
      <BrowserFrame address={frame.address} className="sc-rise [animation-delay:200ms]">
        <Image
          alt=""
          className="block h-auto w-full"
          height={950}
          priority
          sizes="(max-width: 1280px) 60vw, 720px"
          src="/showcase/dashboard.png"
          width={1920}
        />
      </BrowserFrame>

      <div className="sc-rise absolute -left-10 bottom-10 w-[272px] rounded-panel border border-border bg-surface p-4 shadow-overlay [animation-delay:520ms]">
        <p className="text-xs text-muted-foreground">{frame.scoreTitle}</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className="text-4xl font-medium tracking-tight tabular-nums text-foreground">84</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div className="sc-bar h-full rounded-full bg-brand" style={{ width: "84%" }} />
        </div>
        <p className="mt-2.5 text-xs leading-5 text-muted-foreground">{frame.scoreDetail}</p>
      </div>

      <div className="sc-rise absolute -top-4 right-6 inline-flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 font-mono text-[11px] text-foreground shadow-raised [animation-delay:720ms]">
        <span className="size-1.5 rounded-full bg-brand" />
        {frame.syncToast}
      </div>
    </div>
  );
}

function LoopLine({
  steps,
  note,
}: {
  steps: ShowcaseCopy["loopSteps"];
  note: string;
}) {
  return (
    <div className="sc-rise [animation-delay:560ms]">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-[13px] text-muted-foreground">
        {steps.map((step) => (
          <li className="flex items-center gap-2" key={step}>
            <span className="rounded-control border border-border bg-surface px-2.5 py-1 text-foreground">
              {step}
            </span>
            <ArrowRight aria-hidden="true" className="size-3.5 text-border-strong" strokeWidth={1.5} />
          </li>
        ))}
        <li className="rounded-control bg-brand px-2.5 py-1 font-medium text-brand-foreground">
          Offer
        </li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">{note}</p>
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
        <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">
          {title}
        </h2>
      </div>
      {description ? (
        <p className="max-w-xl text-[15px] leading-7 text-muted-foreground lg:justify-self-end">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function ShowcaseContent({
  displayFontVariable,
}: {
  displayFontVariable: string;
}) {
  const [language, setLanguage] = useState<Language>("zh");
  const content = copy[language];
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
      <div aria-hidden="true" className="sc-dots pointer-events-none absolute inset-x-0 top-0 h-[720px]" />

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
              className={buttonClassName({ variant: "ghost", size: "md", className: "hidden md:inline-flex" })}
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
        className="relative mx-auto grid max-w-6xl gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:pb-32 lg:pt-24"
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
            <Link
              className={buttonClassName({ variant: "outline", className: "h-10 px-5 text-sm" })}
              href={localDeployHref}
            >
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

          <div className="mt-12 border-t border-border pt-8">
            <LoopLine note={content.loopNote} steps={content.loopSteps} />
          </div>
        </div>

        <HeroVisual frame={content.frame} />
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

        <div className="mt-16 grid gap-20 lg:gap-28">
          {featureLayout.map((row, rowIndex) => {
            if (row.kind === "compact") {
              return (
                <div className="grid gap-px overflow-hidden rounded-panel border border-border bg-border md:grid-cols-2" key="compact">
                  {row.indexes.map((featureIndex, position) => {
                    const feature = content.features[featureIndex];
                    return (
                      <Reveal className="bg-surface" delay={position * 100} key={feature.title}>
                        <article className="h-full p-7">
                          <span className="font-mono text-xs text-muted-foreground">
                            {String(rowIndex + position + 1).padStart(2, "0")}
                          </span>
                          <h3 className="mt-4 text-lg font-semibold tracking-tight">{feature.title}</h3>
                          <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
                            {feature.description}
                          </p>
                        </article>
                      </Reveal>
                    );
                  })}
                </div>
              );
            }

            const feature = content.features[row.index];
            const displayNumber = rowIndex === 0 ? 1 : rowIndex + 2;
            const reversed = displayNumber % 2 === 0;
            return (
              <Reveal key={feature.title}>
                <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
                  <div className={cn(reversed && "lg:order-2")}>
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(displayNumber).padStart(2, "0")}
                    </span>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight">{feature.title}</h3>
                    <p className="mt-4 max-w-md text-[15px] leading-7 text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                  <div className={cn("overflow-hidden rounded-panel border border-border bg-surface-sunken shadow-raised", reversed && "lg:order-1")}>
                    <Image
                      alt={feature.title}
                      className="block h-auto w-full"
                      height={950}
                      sizes="(max-width: 1024px) 100vw, 660px"
                      src={row.image}
                      width={1920}
                    />
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ============ 边界 ============ */}
      <section className="relative mx-auto max-w-6xl px-5 pb-24 sm:px-8 lg:pb-32">
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
                    <p className="mt-2 max-w-md text-[15px] leading-7 text-muted-foreground">
                      {item.description}
                    </p>
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
              <h2 className="max-w-2xl text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
                {content.ctaTitle}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                {content.ctaDescription}
              </p>
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
