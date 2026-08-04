import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const metrics = [
  { label: "投递岗位", value: "42", detail: "较上周 +6", icon: BriefcaseBusiness },
  { label: "最近 7 天新增", value: "6", detail: "保持稳定节奏", icon: CalendarClock },
  { label: "面试记录", value: "8", detail: "3 场待复盘", icon: MessagesSquare },
  { label: "Offer", value: "2", detail: "转化率 4.8%", icon: CheckCircle2 },
] as const;

const stages = [
  { label: "已投递", count: 18, width: "72%", tone: "bg-info" },
  { label: "笔试/测评", count: 8, width: "42%", tone: "bg-warning" },
  { label: "面试中", count: 9, width: "48%", tone: "bg-brand" },
  { label: "Offer", count: 2, width: "18%", tone: "bg-success" },
] as const;

const applications = [
  { company: "远景科技", job: "AI 应用开发工程师", stage: "一面", tone: "info" as const, updated: "今天 10:24" },
  { company: "澄明智能", job: "LLM Agent 实习生", stage: "笔试/测评", tone: "warning" as const, updated: "昨天 18:40" },
  { company: "星河网络", job: "前端开发工程师", stage: "已投递", tone: "neutral" as const, updated: "昨天 15:12" },
  { company: "云图数据", job: "机器学习平台实习生", stage: "二面", tone: "brand" as const, updated: "8 月 1 日" },
] as const;

const navigation = [
  { label: "数据概览", icon: LayoutDashboard, active: true },
  { label: "投递岗位", icon: BriefcaseBusiness, active: false },
  { label: "简历中心", icon: FileText, active: false },
  { label: "AI 模拟面试", icon: Sparkles, active: false },
  { label: "历史面试", icon: History, active: false },
  { label: "面试复盘", icon: ClipboardCheck, active: false },
  { label: "能力画像", icon: ChartNoAxesCombined, active: false },
] as const;

export const metadata = {
  title: "OfferLai 在线体验",
  description: "使用虚构数据预览 OfferLai 求职管理工作台。",
};

export default function HomepagePreview() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-warning/25 bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning-strong">
        当前为在线体验环境，页面使用虚构数据，不接收或保存个人信息。
      </div>

      <div className="mx-auto min-h-[calc(100vh-33px)] max-w-[1600px] lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-surface lg:flex lg:flex-col">
          <div className="flex h-20 items-center gap-3 border-b border-border px-5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
              OL
            </span>
            <div>
              <p className="font-bold">OfferLai</p>
              <p className="text-xs text-muted-foreground">Career Workspace</p>
            </div>
          </div>

          <nav aria-label="演示导航" className="flex-1 space-y-1 p-3">
            {navigation.map(({ active, icon: Icon, label }) => (
              <div
                className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                }`}
                key={label}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </div>
            ))}
          </nav>

          <div className="border-t border-border p-3">
            <div className="flex h-10 items-center gap-3 px-3 text-sm text-muted-foreground">
              <Settings aria-hidden="true" className="size-4" />
              设置
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-xs font-bold text-brand-foreground lg:hidden">
                OL
              </span>
              <div>
                <p className="text-xs text-muted-foreground">在线体验</p>
                <p className="text-sm font-semibold">数据概览</p>
              </div>
            </div>
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-subtle"
              href="/showcase"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              返回介绍页
            </Link>
          </header>

          <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <section className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-brand">工作台</p>
                <h1 className="mt-1 text-2xl font-bold sm:text-3xl">数据概览</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  汇总岗位投递和面试记录，快速判断近期变化与下一步重点。
                </p>
              </div>
              <Badge tone="brand">演示数据</Badge>
            </section>

            <section aria-label="关键指标" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map(({ detail, icon: Icon, label, value }) => (
                <Card className="rounded-lg" key={label}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="mt-2 text-3xl font-bold">{value}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
                      </div>
                      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle>岗位阶段分布</CardTitle>
                  <p className="text-sm text-muted-foreground">识别当前投递流程主要集中在哪些环节。</p>
                </CardHeader>
                <CardContent className="space-y-5">
                  {stages.map(({ count, label, tone, width }) => (
                    <div key={label}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground">{count} 个岗位</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${tone}`} style={{ width }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle>下一步建议</CardTitle>
                  <p className="text-sm text-muted-foreground">根据当前进度整理的待办重点。</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-warning/25 bg-warning-soft p-4">
                    <p className="text-sm font-semibold text-warning-strong">准备明天的一面</p>
                    <p className="mt-1 text-xs leading-5 text-warning-strong">复盘项目经历并完成 6 道技术问题。</p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-subtle p-4">
                    <p className="text-sm font-semibold">跟进 3 个岗位</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">这些岗位超过 7 天没有状态更新。</p>
                  </div>
                  <div className="rounded-lg border border-success/25 bg-success-soft p-4">
                    <p className="text-sm font-semibold text-success-strong">补充面试复盘</p>
                    <p className="mt-1 text-xs leading-5 text-success-strong">还有 2 场已完成面试等待整理。</p>
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card className="overflow-hidden rounded-lg">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>最近投递</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">按最近状态更新时间排序。</p>
                </div>
                <BriefcaseBusiness aria-hidden="true" className="size-5 text-brand" />
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-surface-subtle text-xs text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-semibold">公司与岗位</th>
                      <th className="px-5 py-3 font-semibold">流程状态</th>
                      <th className="px-5 py-3 font-semibold">来源</th>
                      <th className="px-5 py-3 text-right font-semibold">状态更新</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {applications.map(({ company, job, stage, tone, updated }) => (
                      <tr key={`${company}-${job}`}>
                        <td className="px-5 py-4">
                          <p className="font-semibold">{company}</p>
                          <p className="mt-1 text-muted-foreground">{job}</p>
                        </td>
                        <td className="px-5 py-4"><Badge tone={tone}>{stage}</Badge></td>
                        <td className="px-5 py-4 text-muted-foreground">boss_zhipin</td>
                        <td className="px-5 py-4 text-right text-muted-foreground">{updated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
