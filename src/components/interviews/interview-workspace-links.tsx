import {
  ArrowRight,
  ChartNoAxesCombined,
  ClipboardCheck,
  History,
} from "lucide-react";
import Link from "next/link";

const entries = [
  {
    href: "/interviews/history",
    title: "历史面试",
    description: "查看和维护真实与模拟面试记录。",
    icon: History,
  },
  {
    href: "/interviews/review",
    title: "面试复盘",
    description: "按项目和问题类型回看历史回答。",
    icon: ClipboardCheck,
  },
  {
    href: "/interviews/profile",
    title: "能力画像",
    description: "查看有证据支持的优势、风险和训练重点。",
    icon: ChartNoAxesCombined,
  },
] as const;

export function InterviewWorkspaceLinks() {
  return (
    <section aria-label="面试工具" className="grid gap-3 md:grid-cols-3">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <Link
            className="group rounded-xl border border-border bg-surface p-5 shadow-card transition-[border-color,background-color,transform,box-shadow] duration-200 ease-app hover:-translate-y-0.5 hover:border-brand/30 hover:bg-surface-subtle hover:shadow-raised"
            href={entry.href}
            key={entry.href}
          >
            <Icon aria-hidden="true" className="size-5 text-brand" />
            <h2 className="mt-4 text-sm font-semibold text-foreground">{entry.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand">
              打开
              <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        );
      })}
    </section>
  );
}
