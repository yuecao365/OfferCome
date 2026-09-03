import { ArrowRight, Check } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { ApplicationStats } from "@/lib/applications/types";
import type { InterviewStats } from "@/lib/interviews/types";

function getNextAction(applications: ApplicationStats, interviews: InterviewStats) {
  if (applications.total === 0) {
    return {
      title: "同步或新建第一条投递",
      description: "建立投递记录后，工作台才能判断阶段分布和近期进展。",
      href: "/applications",
      label: "前往投递管理",
    };
  }
  if (applications.stageCounts.applied > 0) {
    return {
      title: "检查仍停留在“已投递”的岗位",
      description: `${applications.stageCounts.applied} 个岗位尚未进入下一阶段，建议核对进展并补充最新状态。`,
      href: "/applications?status=applied",
      label: "查看待跟进岗位",
    };
  }
  if (interviews.total > 0) {
    return {
      title: "复盘最近的面试记录",
      description: "从已经记录的问题和回答中整理可复用经验与训练重点。",
      href: "/interviews/review",
      label: "开始面试复盘",
    };
  }
  return {
    title: "开始一次目标岗位模拟面试",
    description: "现有投递记录尚未进入面试阶段，可以先用真实岗位描述做针对性训练。",
    href: "/interviews/mock",
    label: "开始模拟面试",
  };
}

export function NextActionCard({
  applications,
  interviews,
}: {
  applications: ApplicationStats;
  interviews: InterviewStats;
}) {
  const action = getNextAction(applications, interviews);
  const interviewStarted =
    interviews.total > 0 ||
    applications.stageCounts.first_interview > 0 ||
    applications.stageCounts.second_interview > 0 ||
    applications.stageCounts.third_interview > 0 ||
    applications.stageCounts.hr_interview > 0 ||
    applications.stageCounts.offer > 0;
  const signals = [
    { label: "岗位池已建立", done: applications.total > 0 },
    { label: "近期有新增", done: applications.recent7Days > 0 },
    { label: "面试已启动", done: interviewStarted },
    { label: "获得 Offer", done: applications.stageCounts.offer > 0 },
  ];

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>下一步行动</CardTitle>
        <CardDescription>根据当前记录自动判断。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{action.title}</h3>
        <p className="mt-1.5 text-[0.8125rem] leading-5 text-muted-foreground">{action.description}</p>
        <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-4">
          {signals.map((signal) => (
            <li
              className={cn(
                "flex items-center gap-2 text-xs",
                signal.done ? "text-foreground" : "text-muted-foreground",
              )}
              key={signal.label}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  signal.done ? "border-brand bg-brand text-brand-foreground" : "border-border-strong",
                )}
              >
                {signal.done ? <Check className="size-2.5" strokeWidth={3} /> : null}
              </span>
              <span>{signal.label}</span>
              <span className="sr-only">{signal.done ? "已达成" : "待推进"}</span>
            </li>
          ))}
        </ul>
        <ButtonLink className="mt-6 self-start" href={action.href}>
          {action.label}
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
