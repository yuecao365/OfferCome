import {
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  Database,
  FileText,
  HardDrive,
  MonitorPlay,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const capabilities = [
  {
    icon: BriefcaseBusiness,
    title: "投递管理",
    description: "统一记录岗位、流程状态、来源、时间和备注。",
  },
  {
    icon: FileText,
    title: "简历中心",
    description: "管理 PDF、Word 和图片简历，并索引实习与项目。",
  },
  {
    icon: MessagesSquare,
    title: "面试工作台",
    description: "沉淀真实面试、模拟面试、问题回答和面试复盘。",
  },
  {
    icon: CheckCircle2,
    title: "能力画像",
    description: "根据已完成的面试证据持续更新个人能力画像。",
  },
] as const;

export const metadata = {
  title: "OfferLai - 本地优先的求职管理工具",
  description: "管理投递、简历、面试与复盘，正式数据默认保存在用户自己的设备中。",
};

export default function ShowcasePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
              OL
            </span>
            <div>
              <p className="text-sm font-bold">OfferLai</p>
              <p className="text-xs text-muted-foreground">Local-first career workspace</p>
            </div>
          </div>
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold hover:border-brand/40 hover:bg-surface-subtle"
            href="https://github.com/yuecao365/OfferLai"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            GitHub
          </Link>
        </div>
      </header>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(520px,1.2fr)] lg:items-center lg:py-16">
          <div>
            <p className="text-sm font-semibold text-brand">本地优先的求职管理工具</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">OfferLai</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              将岗位投递、简历版本、真实面试、AI 模拟面试和复盘证据集中到一个安静、可持续维护的工作台。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand-hover"
                href="/homepage"
              >
                <MonitorPlay aria-hidden="true" className="size-4" />
                在线体验
              </Link>
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold hover:border-brand/40 hover:bg-surface-subtle"
                href="https://github.com/yuecao365/OfferLai#docker-本地部署"
              >
                <HardDrive aria-hidden="true" className="size-4" />
                本地部署
              </Link>
            </div>
            <div className="mt-7 flex items-start gap-3 rounded-lg border border-success/25 bg-success-soft p-4 text-sm text-success-strong">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <p className="leading-6">
                当前页面是只读展示环境，不接收简历、投递、面试或平台登录信息。完整功能通过本地部署使用。
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-overlay">
            <Image
              alt="OfferLai 数据概览界面"
              className="h-auto w-full"
              height={900}
              priority
              src="/showcase/overview.png"
              width={1440}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-16">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map(({ icon: Icon, title, description }) => (
            <article className="bg-surface p-5" key={title}>
              <Icon aria-hidden="true" className="size-5 text-brand" />
              <h2 className="mt-4 text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 grid gap-6 border-t border-border pt-10 md:grid-cols-2">
          <div className="flex gap-4">
            <Database aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand" />
            <div>
              <h2 className="font-semibold">数据保存在自己的设备</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                SQLite 数据库、简历文件和 Boss 登录状态由本地运行环境持久化，不进入 OfferLai 中央数据库。
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand" />
            <div>
              <h2 className="font-semibold">敏感能力仅在本地开放</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Boss 登录和同步需要用户本人在本机完成安全验证，公开展示环境不会执行相关自动化。
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
