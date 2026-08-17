"use client";

import {
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Database,
  ExternalLink,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Language = "zh" | "en";

type ShowcaseCopy = {
  navigationLabel: string;
  enterProduct: string;
  heroEyebrow: string;
  heroTitle: readonly [string, string];
  heroDescription: string;
  experienceProduct: string;
  localDeploy: string;
  trustPoints: readonly [string, string, string];
  previewLabel: string;
  openProduct: string;
  highlightsEyebrow: string;
  highlightsTitle: readonly [string, string];
  highlightsDescription: string;
  highlights: readonly { title: string; description: string }[];
  privacy: readonly [
    { title: string; description: string },
    { title: string; description: string },
  ];
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
    heroEyebrow: "本地优先的求职工作台",
    heroTitle: ["把每一次投递和面试，", "沉淀成下一次更好的准备。"],
    heroDescription:
      "投递记录留在招聘平台，简历躺在文件夹里，面试经历只存在脑子里。OfferLai 把它们连成一个闭环：投递、简历、真实面试、AI 模拟训练、复盘，最后汇成一份持续更新的能力画像。",
    experienceProduct: "在线体验真实产品",
    localDeploy: "本地部署",
    trustPoints: ["数据默认留在本机", "公开体验只读", "敏感自动化仅本地运行"],
    previewLabel: "OfferLai · 数据概览",
    openProduct: "打开产品",
    highlightsEyebrow: "产品亮点",
    highlightsTitle: ["不只是记录，", "而是积累可复用的求职经验。"],
    highlightsDescription:
      "从导入已有投递，到用技能包和你的经历生成下一场模拟面试，再到能力画像长期更新，每个环节的产出都会成为下一个环节的输入。",
    highlights: [
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
    heroEyebrow: "LOCAL-FIRST CAREER WORKSPACE",
    heroTitle: [
      "Turn every application and interview",
      "into better preparation for the next one.",
    ],
    heroDescription:
      "Applications live in one platform, resumes in a folder, interview memories in your head. OfferLai closes the loop: applications, resumes, real interviews, AI mock practice, review, and a capability profile that keeps growing.",
    experienceProduct: "Explore the real product",
    localDeploy: "Run locally",
    trustPoints: ["Data stays on your device", "Public demo is read-only", "Sensitive automation runs locally"],
    previewLabel: "OfferLai · Dashboard",
    openProduct: "Open product",
    highlightsEyebrow: "Product highlights",
    highlightsTitle: ["More than a tracker.", "A reusable record of your career growth."],
    highlightsDescription:
      "From importing existing applications to generating the next mock interview from skill packs and your own history, every stage produces evidence that makes the next one sharper.",
    highlights: [
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
    ctaTitle: "Explore the complete product online, then keep your own data on your device.",
    enterExperience: "Open live preview",
    viewSource: "View source",
    footerNote: "The live preview uses fictional data and does not persist changes.",
  },
} satisfies Record<Language, ShowcaseCopy>;

const highlightIcons = [
  BriefcaseBusiness,
  BookOpenCheck,
  Sparkles,
  Mic,
  RefreshCw,
] as const;

export function ShowcaseContent() {
  const [language, setLanguage] = useState<Language>("zh");
  const content = copy[language];
  const localDeployHref =
    language === "zh"
      ? "https://github.com/yuecao365/OfferLai/blob/main/README_CN.md#快速开始"
      : "https://github.com/yuecao365/OfferLai#quick-start";

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  function selectLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link className="flex items-center gap-3" href="/showcase">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
              OL
            </span>
            <span className="font-semibold">OfferLai</span>
          </Link>

          <nav aria-label={content.navigationLabel} className="flex items-center gap-2">
            <div
              aria-label={language === "zh" ? "切换展示语言" : "Change showcase language"}
              className="flex rounded-md border border-border-strong bg-surface-subtle p-0.5"
              role="group"
            >
              {(["zh", "en"] as const).map((option) => {
                const active = language === option;
                return (
                  <button
                    aria-pressed={active}
                    className={`flex h-7 min-w-8 items-center justify-center rounded px-2 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-surface text-foreground shadow-card"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    key={option}
                    onClick={() => selectLanguage(option)}
                    type="button"
                  >
                    {option === "zh" ? "中" : "EN"}
                  </button>
                );
              })}
            </div>
            <Link
              className="hidden h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground md:inline-flex"
              href="https://github.com/yuecao365/OfferLai"
            >
              GitHub
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Link>
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
              href="/homepage"
            >
              {content.enterProduct}
              <ArrowRight aria-hidden="true" className="hidden size-4 sm:block" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-5 pb-0 pt-16 text-center sm:px-8 sm:pt-20 lg:pt-24">
          <p className="text-sm font-semibold text-brand">{content.heroEyebrow}</p>
          <h1 className="mx-auto mt-5 max-w-5xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            <span>{content.heroTitle[0]}</span>
            <br className="hidden sm:block" />{" "}
            <span>{content.heroTitle[1]}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            {content.heroDescription}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
              href="/homepage"
            >
              {content.experienceProduct}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-sm font-semibold transition-colors hover:border-brand/40 hover:bg-surface-subtle"
              href={localDeployHref}
            >
              {content.localDeploy}
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground sm:text-sm">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-4 text-brand" />
              {content.trustPoints[0]}
            </span>
            <span>{content.trustPoints[1]}</span>
            <span>{content.trustPoints[2]}</span>
          </div>

          <Link
            aria-label={content.openProduct}
            className="group relative mt-12 block overflow-hidden rounded-t-lg border border-b-0 border-border-strong bg-surface-subtle text-left shadow-overlay sm:mt-14"
            href="/homepage"
          >
            <div className="flex h-10 items-center justify-between border-b border-border bg-surface px-4">
              <div aria-hidden="true" className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{content.previewLabel}</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100">
                {content.openProduct}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </span>
            </div>
            <Image
              alt={language === "zh" ? "OfferLai 实际产品的数据概览主页" : "OfferLai product dashboard"}
              className="h-auto w-full"
              height={952}
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              src="/showcase/product-dashboard.png"
              width={1918}
            />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-8 border-b border-border pb-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-brand">{content.highlightsEyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              <span>{content.highlightsTitle[0]}</span>
              <br />
              <span>{content.highlightsTitle[1]}</span>
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">
            {content.highlightsDescription}
          </p>
        </div>

        <div className="grid sm:grid-cols-2">
          {content.highlights.map(({ title, description }, itemIndex) => {
            const Icon = highlightIcons[itemIndex];
            return (
              <article
                className={`border-b border-border py-8 sm:p-8 ${
                  itemIndex % 2 === 0 ? "sm:border-r" : ""
                }`}
                key={title}
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <Icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {String(itemIndex + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 lg:py-18">
          <div className="flex gap-4">
            <Database aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand" />
            <div>
              <h2 className="font-semibold">{content.privacy[0].title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {content.privacy[0].description}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand" />
            <div>
              <h2 className="font-semibold">{content.privacy[1].title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {content.privacy[1].description}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="flex flex-col gap-7 border-t border-border pt-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand">{content.ctaEyebrow}</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight">{content.ctaTitle}</h2>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
              href="/homepage"
            >
              {content.enterExperience}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-sm font-semibold transition-colors hover:border-brand/40 hover:bg-surface-subtle"
              href="https://github.com/yuecao365/OfferLai"
            >
              {content.viewSource}
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>OfferLai · Local-first career workspace</span>
          <span>{content.footerNote}</span>
        </div>
      </footer>
    </main>
  );
}
