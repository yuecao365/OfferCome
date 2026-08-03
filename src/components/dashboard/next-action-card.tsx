import { ArrowRight, CheckCircle2, Circle, Sparkles } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    description: "现有投递记录尚未进入面试阶段，可以先用真实 JD 做针对性训练。",
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
    <Card className="border-brand/20 bg-accent/35">
      <CardContent className="flex h-full min-h-72 flex-col p-6">
        <span className="flex size-10 items-center justify-center rounded-lg bg-brand text-brand-foreground">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-brand">下一步行动</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{action.title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{action.description}</p>
        <div className="mt-5 border-t border-brand/15 pt-4">
          <p className="text-xs font-semibold text-foreground">进展信号</p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {signals.map((signal) => (
              <li
                className={signal.done ? "flex items-center gap-2 text-xs text-foreground" : "flex items-center gap-2 text-xs text-muted-foreground"}
                key={signal.label}
              >
                {signal.done ? (
                  <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-success" />
                ) : (
                  <Circle aria-hidden="true" className="size-3.5 shrink-0" />
                )}
                <span>{signal.label}</span>
                <span className="sr-only">{signal.done ? "已达成" : "待推进"}</span>
              </li>
            ))}
          </ul>
        </div>
        <ButtonLink className="mt-6 self-start" href={action.href}>
          {action.label}
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
