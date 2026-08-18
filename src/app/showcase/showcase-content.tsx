"use client";

import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Check,
  Database,
  ExternalLink,
  Inbox,
  ShieldCheck,
} from "lucide-react";
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
  collage: {
    address: string;
    eyebrow: string;
    mainLabel: string;
    growBadge: string;
    tiles: readonly [string, string, string];
    toast: ReactNode;
    graphTitle: string;
    graphNodeA: string;
    graphNodeB: string;
    insight: string;
    scoreTitle: string;
    scoreVerdict: string;
    scoreDetail: readonly [string, string];
  };
  highlightsEyebrow: string;
  highlightsTitle: readonly [string, string];
  highlightsDescription: string;
  features: readonly [Feature, Feature, Feature, Feature, Feature];
  privacy: readonly [Feature, Feature];
  ctaEyebrow: string;
  ctaTitle: string;
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
        开源 · 数据全部留在本机。OfferLai 把<b>投递、面试、复盘</b>
        沉淀成你的<b>能力画像</b>，让下一场，永远比上一场准备得更好。
      </>
    ),
    experienceProduct: "在线体验真实产品",
    localDeploy: "本地部署",
    trustPoints: ["数据默认留在本机", "公开体验只读", "敏感自动化仅本地运行"],
    loopSteps: ["投递", "面试", "复盘", "画像"],
    loopNote: "画像反过来决定下一场模拟面试的出题重点 —— 这是一个闭环",
    collage: {
      address: "localhost:3000 · OfferLai 数据概览",
      eyebrow: "求职进行中",
      mainLabel: "投递岗位",
      growBadge: "最近 7 天 +6",
      tiles: ["7 天新增", "真实面试", "Offer"],
      toast: (
        <>
          已同步 3 条新投递 <em>· boss_zhipin</em>
        </>
      ),
      graphTitle: "能力画像",
      graphNodeA: "技术基础",
      graphNodeB: "项目表达",
      insight: "↑ 技术基础较稳定 · 证据 3 场 / 4 条",
      scoreTitle: "AI 模拟面试 · 报告",
      scoreVerdict: "表现良好",
      scoreDetail: ["逐题证据评分", "已汇入能力画像"],
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
    ctaEyebrow: "开始体验",
    ctaTitle: "先在线浏览完整产品，再把数据留在自己的设备上。",
    enterExperience: "进入在线体验",
    viewSource: "查看源码",
    footerNote: "在线体验使用虚构数据，不保存操作结果。",
  },
  en: {
    navigationLabel: "Showcase navigation",
    enterProduct: "Open product",
    heroTitle: ["Every interview", "counts"],
    heroDescription: (
      <>
        Open source, local-first. OfferLai turns <b>applications, interviews
        and reviews</b> into a living <b>capability profile</b> — so every next
        interview starts better prepared than the last.
      </>
    ),
    experienceProduct: "Explore the real product",
    localDeploy: "Run locally",
    trustPoints: [
      "Data stays on your device",
      "Public demo is read-only",
      "Sensitive automation runs locally",
    ],
    loopSteps: ["Apply", "Interview", "Review", "Profile"],
    loopNote:
      "The profile then decides what your next mock interview drills — a closed loop.",
    collage: {
      address: "localhost:3000 · OfferLai dashboard",
      eyebrow: "JOB SEARCH IN PROGRESS",
      mainLabel: "applications",
      growBadge: "+6 in 7 days",
      tiles: ["New in 7 days", "Real interviews", "Offers"],
      toast: (
        <>
          3 new applications synced <em>· boss_zhipin</em>
        </>
      ),
      graphTitle: "Capability profile",
      graphNodeA: "Fundamentals",
      graphNodeB: "Storytelling",
      insight: "↑ Solid fundamentals · 3 interviews / 4 pieces of evidence",
      scoreTitle: "AI MOCK INTERVIEW · REPORT",
      scoreVerdict: "Strong performance",
      scoreDetail: ["Evidence-based scoring", "Merged into your profile"],
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
          "Audio, transcripts, review notes, PDF or Word — OfferLai works out the material type, which voice is yours, and the company, role and round, then hands you an editable draft.",
      },
      {
        title: "A capability profile that coaches you",
        description:
          "From your very first interview you get what to keep doing and what to practise, grouped into content, evidence, and delivery. Every insight is backed by your own words, and any weak spot turns into targeted practice with one click.",
      },
    ],
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
    ctaEyebrow: "Get started",
    ctaTitle:
      "Explore the complete product online, then keep your own data on your device.",
    enterExperience: "Open live preview",
    viewSource: "View source",
    footerNote: "The live preview uses fictional data and does not persist changes.",
  },
} satisfies Record<Language, ShowcaseCopy>;

/** 功能区排版：三大（配截图）+ 两小（纯文字卡），顺序沿闭环叙事。 */
const featureLayout = [
  { kind: "big", index: 0, image: "/showcase/applications.png" },
  { kind: "compact", indexes: [1, 3] },
  { kind: "big", index: 2, image: "/showcase/mock-interview.png" },
  { kind: "big", index: 4, image: "/showcase/ability-profile.png" },
] as const;

const compactIcons = [BookOpenCheck, Inbox] as const;

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

/** 主视觉右侧的产品拼贴：真实 UI 的手绘复刻，数字与 demo 站一致。 */
function HeroCollage({ content }: { content: ShowcaseCopy["collage"] }) {
  return (
    <div aria-hidden="true" className="relative hidden min-h-[560px] lg:block">
      {/* 主窗：数据概览 */}
      <div className="sc-rise absolute left-10 top-20 w-[560px] rounded-2xl border border-border bg-surface shadow-raised [animation-delay:250ms]">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <span className="size-2.5 rounded-full bg-[#f26d5f]" />
          <span className="size-2.5 rounded-full bg-[#f2b63c]" />
          <span className="size-2.5 rounded-full bg-[#38b26a]" />
          <span className="ml-2 text-xs font-medium tracking-wide text-muted-foreground">
            {content.address}
          </span>
        </div>
        <div className="stat-hero rounded-b-2xl p-7">
          <p className="text-xs font-bold tracking-[0.14em] text-brand">
            {content.eyebrow}
          </p>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="text-[68px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">
              16
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {content.mainLabel}
            </span>
          </p>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
            {content.growBadge}
          </span>
          <div className="mt-5 flex gap-2.5">
            {([
              [content.tiles[0], "6", false],
              [content.tiles[1], "2", false],
              [content.tiles[2], "1", true],
            ] as const).map(([label, value, highlighted]) => (
              <div
                className={cn(
                  "flex-1 rounded-xl border p-3",
                  highlighted
                    ? "border-accent-strong bg-accent/45"
                    : "border-border bg-surface/75",
                )}
                key={label}
              >
                <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                <p
                  className={cn(
                    "mt-1 text-2xl font-bold leading-none tabular-nums",
                    highlighted && "text-brand",
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 浮卡：能力画像星座 */}
      <div className="sc-pop sc-float absolute -right-2 top-2 w-[280px] rounded-2xl border border-border bg-surface p-5 shadow-raised [--sc-rot:-1.8deg] [animation-delay:650ms,0ms]">
        <p className="text-xs font-bold tracking-[0.1em] text-muted-foreground">
          {content.graphTitle}
        </p>
        <div className="mt-3 h-[136px] overflow-hidden rounded-xl bg-surface-subtle">
          <svg className="size-full" viewBox="0 0 240 136">
            <line stroke="#b9d8cc" strokeWidth="1.6" x1="48" x2="108" y1="88" y2="40" />
            <line stroke="#b9d8cc" strokeWidth="1.6" x1="108" x2="180" y1="40" y2="70" />
            <line stroke="#cfe2d9" strokeWidth="1.4" x1="48" x2="122" y1="88" y2="106" />
            <line stroke="#cfe2d9" strokeWidth="1.4" x1="180" x2="122" y1="70" y2="106" />
            <line stroke="#d9e8e0" strokeWidth="1.2" x1="108" x2="206" y1="40" y2="24" />
            <circle cx="108" cy="40" fill="#34d399" opacity=".92" r="12" />
            <circle cx="108" cy="40" fill="none" opacity=".4" r="18" stroke="#34d399" strokeWidth="1.4" />
            <circle cx="48" cy="88" fill="#176b5d" opacity=".85" r="8" />
            <circle cx="180" cy="70" fill="#5cc4a2" r="10" />
            <circle cx="122" cy="106" fill="#9ed3bd" r="6" />
            <circle cx="206" cy="24" fill="#bfe0d1" r="4.5" />
            <text fill="#3d5148" fontSize="10" fontWeight="600" textAnchor="middle" x="108" y="68">
              {content.graphNodeA}
            </text>
            <text fill="#7d8b84" fontSize="9.5" textAnchor="middle" x="180" y="92">
              {content.graphNodeB}
            </text>
          </svg>
        </div>
        <span className="mt-3 inline-flex rounded-full border border-accent-strong bg-accent/45 px-3 py-1.5 text-xs font-semibold text-accent-foreground">
          {content.insight}
        </span>
      </div>

      {/* 浮卡：模拟面试评分环 */}
      <div className="sc-pop sc-float absolute bottom-6 left-2 w-[260px] rounded-2xl border border-border bg-surface p-5 shadow-raised [--sc-rot:1.6deg] [animation-delay:850ms,2.6s]">
        <p className="text-xs font-bold tracking-[0.1em] text-muted-foreground">
          {content.scoreTitle}
        </p>
        <div className="mt-3.5 flex items-center gap-4">
          <div className="relative size-[78px] shrink-0 rounded-full bg-[conic-gradient(var(--brand)_0_302deg,var(--muted)_302deg_360deg)]">
            <div className="absolute inset-[8px] rounded-full bg-surface" />
            <b className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold tabular-nums">
              84
            </b>
          </div>
          <div>
            <p className="text-sm font-bold">{content.scoreVerdict}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {content.scoreDetail[0]}
              <br />
              {content.scoreDetail[1]}
            </p>
          </div>
        </div>
      </div>

      {/* 浮标：同步 toast */}
      <div className="sc-drop absolute left-16 top-11 z-10 flex rotate-[-1deg] items-center gap-2.5 rounded-xl bg-[#122b23] px-4 py-2.5 text-[13px] font-medium text-[#d9efe6] shadow-overlay [animation-delay:1200ms]">
        <span className="flex size-4 items-center justify-center rounded-full bg-[#34d399]">
          <Check aria-hidden="true" className="size-2.5 stroke-[3.4] text-[#0b2a20]" />
        </span>
        <span className="[&_em]:not-italic [&_em]:text-[#7fb7a3]">{content.toast}</span>
      </div>
    </div>
  );
}

function LoopChips({
  steps,
  note,
}: {
  steps: ShowcaseCopy["loopSteps"];
  note: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-y-3">
        {steps.map((step, index) => (
          <span className="sc-pop flex items-center" key={step} style={{ animationDelay: `${900 + index * 110}ms` }}>
            <span className="rounded-xl border-[1.5px] border-border-strong bg-surface px-4 py-2 text-[15px] font-semibold shadow-card">
              {step}
            </span>
            <ArrowRight aria-hidden="true" className="mx-1.5 size-4 text-border-strong" />
          </span>
        ))}
        <span className="sc-pop rounded-xl bg-brand px-5 py-2.5 text-[15px] font-extrabold tracking-wide text-brand-foreground shadow-glow-brand [animation-delay:1400ms]">
          Offer
        </span>
      </div>
      <p className="mt-3.5 text-xs tracking-wide text-muted-foreground">{note}</p>
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
      {/* 氛围层 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-60 -top-72 h-[860px] w-[1000px] bg-[radial-gradient(closest-side,rgb(23_107_93/0.1),transparent_70%)]" />
        <div className="absolute -bottom-96 -right-72 h-[900px] w-[1000px] bg-[radial-gradient(closest-side,rgb(52_211_153/0.12),transparent_70%)]" />
        <div className="sc-dots absolute inset-0" />
      </div>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link className="flex items-center gap-3" href="/showcase">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-brand-foreground">
              OL
            </span>
            <span className="font-bold tracking-tight">OfferLai</span>
          </Link>

          <nav aria-label={content.navigationLabel} className="flex items-center gap-2">
            <div
              aria-label={language === "zh" ? "切换展示语言" : "Change showcase language"}
              className="flex rounded-lg border border-border-strong bg-surface-subtle p-0.5"
              role="group"
            >
              {(["zh", "en"] as const).map((option) => (
                <button
                  aria-pressed={language === option}
                  className={cn(
                    "flex h-7 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors",
                    language === option
                      ? "bg-surface text-foreground shadow-card"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  key={option}
                  onClick={() => setLanguage(option)}
                  type="button"
                >
                  {option === "zh" ? "中" : "EN"}
                </button>
              ))}
            </div>
            <Link
              className="hidden h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground md:inline-flex"
              href="https://github.com/yuecao365/OfferLai"
            >
              GitHub
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Link>
            <Link className={buttonClassName({ size: "sm", className: "h-9 px-3.5" })} href="/homepage">
              {content.enterProduct}
              <ArrowRight aria-hidden="true" className="hidden size-4 sm:block" />
            </Link>
          </nav>
        </div>
      </header>

      {/* ============ Hero ============ */}
      <section className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:pb-28 lg:pt-20">
        <div>
          <h1
            className="text-[56px] font-black leading-[1.14] sm:text-[72px] xl:text-[84px]"
            style={{ fontFamily: "var(--font-sc-display), var(--font-sans, inherit)" }}
          >
            <span className="sc-rise block">{content.heroTitle[0]}</span>
            <span className="sc-rise relative inline-block [animation-delay:120ms]">
              {content.heroTitle[1]}
              <span className="text-brand">。</span>
              <svg
                aria-hidden="true"
                className="sc-chartline absolute -bottom-5 left-1 right-0 h-8 w-[103%]"
                fill="none"
                preserveAspectRatio="none"
                viewBox="0 0 360 40"
              >
                <path
                  d="M4 32 L96 26 L188 29 L286 10 L340 14"
                  pathLength="1"
                  stroke="#34d399"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
                <circle cx="340" cy="14" fill="#176b5d" r="7.5" stroke="#f4f8f6" strokeWidth="3.5" />
              </svg>
            </span>
          </h1>

          <p className="sc-rise mt-12 max-w-xl text-lg leading-9 text-muted-foreground [animation-delay:240ms] [&_b]:font-bold [&_b]:text-brand">
            {content.heroDescription}
          </p>

          <div className="sc-rise mt-9 flex flex-wrap items-center gap-3 [animation-delay:360ms]">
            <Link className={buttonClassName({ className: "h-11 px-6" })} href="/homepage">
              {content.experienceProduct}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              className={buttonClassName({ variant: "outline", className: "h-11 px-6" })}
              href={localDeployHref}
            >
              {content.localDeploy}
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </div>

          <div className="sc-rise mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground [animation-delay:480ms] sm:text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden="true" className="size-4 text-brand" />
              {content.trustPoints[0]}
            </span>
            <span>{content.trustPoints[1]}</span>
            <span>{content.trustPoints[2]}</span>
          </div>

          <div className="mt-12">
            <LoopChips note={content.loopNote} steps={content.loopSteps} />
          </div>
        </div>

        <HeroCollage content={content.collage} />
      </section>

      {/* ============ 功能：一个闭环，五个环节 ============ */}
      <section className="relative mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28">
        <Reveal>
          <div className="grid gap-8 border-b border-border pb-12 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-end">
            <div>
              <p className="text-sm font-bold text-brand">{content.highlightsEyebrow}</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                <span>{content.highlightsTitle[0]}</span>
                <br />
                <span>{content.highlightsTitle[1]}</span>
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground lg:justify-self-end">
              {content.highlightsDescription}
            </p>
          </div>
        </Reveal>

        <div className="mt-16 grid gap-16 lg:gap-24">
          {featureLayout.map((row, rowIndex) => {
            if (row.kind === "compact") {
              return (
                <div className="grid gap-5 md:grid-cols-2" key="compact">
                  {row.indexes.map((featureIndex, position) => {
                    const feature = content.features[featureIndex];
                    const Icon = compactIcons[position];
                    return (
                      <Reveal delay={position * 120} key={feature.title}>
                        <article className="group h-full rounded-2xl border border-border bg-surface p-7 shadow-card transition-[border-color,box-shadow,transform] duration-200 ease-app hover:-translate-y-1 hover:border-brand/30 hover:shadow-raised">
                          <div className="flex items-center justify-between">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                              <Icon aria-hidden="true" className="size-5" />
                            </span>
                            <span className="text-xs font-bold text-muted-foreground">
                              {String(rowIndex + position + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <h3 className="mt-5 text-lg font-bold">{feature.title}</h3>
                          <p className="mt-3 text-sm leading-7 text-muted-foreground">
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
                <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                  <div className={cn(reversed && "lg:order-2")}>
                    <span className="text-xs font-bold tracking-[0.18em] text-brand">
                      {String(displayNumber).padStart(2, "0")}
                    </span>
                    <h3 className="mt-3 text-2xl font-bold tracking-tight sm:text-[28px]">
                      {feature.title}
                    </h3>
                    <p className="mt-4 max-w-xl text-[15px] leading-8 text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "group overflow-hidden rounded-2xl border border-border bg-surface-sunken shadow-raised",
                      reversed && "lg:order-1",
                    )}
                  >
                    <Image
                      alt={feature.title}
                      className="h-auto w-full transition-transform duration-500 ease-app group-hover:scale-[1.02]"
                      height={950}
                      sizes="(max-width: 1024px) 100vw, 640px"
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

      {/* ============ 隐私 ============ */}
      <section className="relative mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-24">
        <div className="grid gap-5 md:grid-cols-2">
          {content.privacy.map((item, index) => {
            const Icon = index === 0 ? Database : ShieldCheck;
            return (
              <Reveal delay={index * 120} key={item.title}>
                <div className="flex h-full gap-4 rounded-2xl border border-border bg-surface p-7 shadow-card">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-bold">{item.title}</h2>
                    <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <Reveal>
          <div className="stat-hero flex flex-col gap-8 rounded-3xl border border-border p-10 sm:p-14 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold text-brand">{content.ctaEyebrow}</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight tracking-tight">
                {content.ctaTitle}
              </h2>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link className={buttonClassName({ className: "h-11 px-6" })} href="/homepage">
                {content.enterExperience}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                className={buttonClassName({ variant: "outline", className: "h-11 px-6" })}
                href="https://github.com/yuecao365/OfferLai"
              >
                {content.viewSource}
                <ExternalLink aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="relative border-t border-border bg-surface/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>OfferLai · Local-first career workspace</span>
          <span>{content.footerNote}</span>
        </div>
      </footer>
    </main>
  );
}
