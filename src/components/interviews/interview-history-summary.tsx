import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

export function InterviewHistorySummary({
  body,
  dataSufficient,
  title,
}: {
  body: string;
  dataSufficient: boolean;
  title: string;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <div>
        <p className="text-xs text-muted-foreground">
          {dataSufficient ? "基于真实记录自动汇总" : "样本不足，暂按现有记录汇总"}
        </p>
        <h3 className="mt-2 text-base font-semibold leading-6 tracking-tight text-foreground">{title}</h3>
        <p className="mt-2 text-[0.8125rem] leading-6 text-muted-foreground">{body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/interviews/profile" size="sm" variant="outline">
          查看能力证据
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </ButtonLink>
        <ButtonLink href="/interviews/review" size="sm" variant="ghost">打开面试复盘</ButtonLink>
      </div>
    </div>
  );
}
