import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasCompletedMockInterview } from "@/lib/mock-interviews/queries";
import { getResumes } from "@/lib/resumes/queries";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";
import { cn } from "@/lib/cn";

type SetupStep = {
  done: boolean;
  label: string;
  hint: string;
  href: string;
};

/**
 * 数据驱动的开始清单：全部条件满足时不渲染任何内容，
 * 不需要用户手动关闭，也不引入额外存储。
 */
export async function GettingStartedCard({
  hasApplications,
}: {
  hasApplications: boolean;
}) {
  const [textConfig, resumes, mockCompleted] = await Promise.all([
    getAiTaskConfig("text"),
    getResumes(),
    hasCompletedMockInterview(),
  ]);

  const steps: SetupStep[] = [
    {
      done: isAiTaskConfigured(textConfig),
      label: "配置文本模型",
      hint: "AI 模拟面试、解析和画像都依赖它",
      href: "/settings",
    },
    {
      done: resumes.length > 0,
      label: "上传一份简历",
      hint: "出题和能力画像的核心素材",
      href: "/resumes",
    },
    {
      done: hasApplications,
      label: "添加或同步投递记录",
      hint: "手动新建，或同步 Boss 直聘",
      href: "/applications",
    },
    {
      done: mockCompleted,
      label: "完成第一次 AI 模拟面试",
      hint: "获得有证据支持的评分与建议",
      href: "/interviews/mock",
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>开始使用</CardTitle>
          <CardDescription>
            完成这几步，工作台就能端到端运转起来。
          </CardDescription>
        </div>
        <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold tabular-nums text-accent-foreground">
          {doneCount}/{steps.length}
        </span>
      </CardHeader>
      <CardContent className="grid gap-1 p-2 sm:grid-cols-2">
        {steps.map((step) =>
          step.done ? (
            <div
              className="flex items-center gap-3 rounded-lg px-3 py-2.5"
              key={step.label}
            >
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-success" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground line-through decoration-border-strong">
                  {step.label}
                </p>
              </div>
            </div>
          ) : (
            <Link
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5",
                "transition-colors duration-200 ease-app hover:bg-surface-subtle",
              )}
              href={step.href}
              key={step.label}
            >
              <Circle aria-hidden="true" className="size-5 shrink-0 text-border-strong" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{step.label}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{step.hint}</p>
              </div>
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-app group-hover:translate-x-0.5 group-hover:text-brand"
              />
            </Link>
          ),
        )}
      </CardContent>
    </Card>
  );
}
