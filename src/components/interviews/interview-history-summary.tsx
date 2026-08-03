import { ArrowRight, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
        <div className="flex items-center justify-between gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Sparkles aria-hidden="true" className="size-4" />
          </span>
          <Badge tone={dataSufficient ? "brand" : "neutral"}>基于真实记录自动汇总</Badge>
        </div>
        <h3 className="mt-5 text-lg font-semibold leading-7 text-foreground">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/interviews/profile" size="sm" variant="outline">
          查看能力证据
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </ButtonLink>
        <ButtonLink href="/interviews/review" size="sm" variant="ghost">打开面试复盘</ButtonLink>
      </div>
    </div>
  );
}
