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
    <section aria-label="面试工具" className="grid gap-2 md:grid-cols-3">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <Link
            className="group flex items-start gap-3 rounded-panel border border-border bg-surface p-4 transition-colors duration-150 hover:bg-surface-subtle"
            href={entry.href}
            key={entry.href}
          >
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{entry.title}</span>
              <span className="mt-0.5 block text-[0.8125rem] leading-5 text-muted-foreground">
                {entry.description}
              </span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
              strokeWidth={1.5}
            />
          </Link>
        );
      })}
    </section>
  );
}
