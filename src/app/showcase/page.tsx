import {
  ArrowRight,
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

import productDashboard from "../../../docs/images/dashboard.png";

const productHighlights = [
  {
    icon: BriefcaseBusiness,
    index: "01",
    title: "Boss 投递，一键进入工作台",
    description:
      "通过本机有头浏览器导入本人已有投递，自动去重并突出新增与来源变化；登录校验仍由用户手动完成。",
  },
  {
    icon: Sparkles,
    index: "02",
    title: "模拟面试，带着你的经历开始",
    description:
      "将目标 JD、所选简历、历史面试问答和最新能力画像按岗位相关性注入，而不是每次从通用问题重新开始。",
  },
  {
    icon: Mic,
    index: "03",
    title: "文字与语音，自由切换",
    description:
      "支持朗读问题、麦克风回答、语音转写和提交前修改，在接近真实面试的节奏中完成逐题训练。",
  },
  {
    icon: RefreshCw,
    index: "04",
    title: "能力画像，随面试持续更新",
    description:
      "真实与模拟面试完成后持续吸收新证据，保留版本快照、岗位上下文、优势短板和下一步训练重点。",
  },
] as const;

export const metadata = {
  title: "OfferLai - 本地优先的求职管理工作台",
  description:
    "用一个本地优先的工作台管理投递、简历、真实面试、AI 模拟面试、复盘与长期能力画像。",
};

export default function ShowcasePage() {
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

          <nav aria-label="展示页导航" className="flex items-center gap-2">
            <Link
              className="hidden h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground sm:inline-flex"
              href="https://github.com/yuecao365/OfferLai"
            >
              GitHub
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Link>
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
              href="/homepage"
            >
              进入产品
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-5 pb-0 pt-16 text-center sm:px-8 sm:pt-20 lg:pt-24">
          <p className="text-sm font-semibold text-brand">LOCAL-FIRST CAREER WORKSPACE</p>
          <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            把每一次投递和面试，
            <br className="hidden sm:block" />
            沉淀成下一次更好的准备。
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            OfferLai 将投递、简历、真实面试、AI 模拟训练、复盘与能力画像连接成一个持续演进的求职工作台。
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
              href="/homepage"
            >
              在线体验真实产品
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-sm font-semibold transition-colors hover:border-brand/40 hover:bg-surface-subtle"
              href="https://github.com/yuecao365/OfferLai#quick-start"
            >
              本地部署
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground sm:text-sm">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-4 text-brand" />
              数据默认留在本机
            </span>
            <span>公开体验只读</span>
            <span>敏感自动化仅本地运行</span>
          </div>

          <Link
            aria-label="打开 OfferLai 在线产品"
            className="group relative mt-12 block overflow-hidden rounded-t-lg border border-b-0 border-border-strong bg-surface-subtle text-left shadow-overlay sm:mt-14"
            href="/homepage"
          >
            <div className="flex h-10 items-center justify-between border-b border-border bg-surface px-4">
              <div aria-hidden="true" className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">OfferLai · 数据概览</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100">
                打开产品
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </span>
            </div>
            <Image
              alt="OfferLai 实际产品的数据概览主页"
              className="h-auto w-full"
              placeholder="blur"
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              src={productDashboard}
            />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-8 border-b border-border pb-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-brand">产品亮点</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              不只是记录，
              <br />
              而是积累可复用的求职经验。
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">
            从导入已有投递，到用历史经历生成下一场模拟面试，再到能力画像长期更新，OfferLai 让分散的求职信息形成连续反馈。
          </p>
        </div>

        <div className="grid sm:grid-cols-2">
          {productHighlights.map(({ icon: Icon, index, title, description }, itemIndex) => (
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
                <span className="text-xs font-semibold text-muted-foreground">{index}</span>
              </div>
              <h3 className="mt-6 text-lg font-semibold">{title}</h3>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 lg:py-18">
          <div className="flex gap-4">
            <Database aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand" />
            <div>
              <h2 className="font-semibold">数据属于用户，而不是平台</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                正式使用时，SQLite 数据库、简历文件与 Boss 浏览器状态保存在用户自己的设备中，不进入 OfferLai 中央数据库。
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand" />
            <div>
              <h2 className="font-semibold">自动化有边界，安全校验不绕过</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Boss 登录、扫码、验证码与安全校验始终由用户本人完成；系统只读取已有记录，不自动投递，也不发送消息。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="flex flex-col gap-7 border-t border-border pt-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand">开始体验</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight">
              先在线浏览完整产品，再把数据留在自己的设备上。
            </h2>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
              href="/homepage"
            >
              进入在线体验
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-sm font-semibold transition-colors hover:border-brand/40 hover:bg-surface-subtle"
              href="https://github.com/yuecao365/OfferLai"
            >
              查看源码
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>OfferLai · Local-first career workspace</span>
          <span>在线体验使用虚构数据，不保存操作结果。</span>
        </div>
      </footer>
    </main>
  );
}
