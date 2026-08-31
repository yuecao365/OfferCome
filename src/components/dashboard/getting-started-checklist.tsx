import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export type SetupStep = {
  done: boolean;
  label: string;
  hint: string;
  href: string;
};

/** 开始清单的呈现层：本地版由服务端算步骤，网页版由浏览器算，渲染同一张卡。 */
export function GettingStartedChecklist({ steps }: { steps: SetupStep[] }) {
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
