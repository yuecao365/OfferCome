"use client";

import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    sufficient: "基于真实记录自动汇总",
    insufficient: "样本不足，暂按现有记录汇总",
    evidence: "查看能力证据",
    review: "打开面试复盘",
  },
  en: {
    sufficient: "Summarized from your real records",
    insufficient: "Limited data — summarized from what's recorded so far",
    evidence: "View evidence",
    review: "Open interview review",
  },
});

export function InterviewHistorySummary({
  body,
  dataSufficient,
  title,
}: {
  body: string;
  dataSufficient: boolean;
  title: string;
}) {
  const t = useMessages(messages);
  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <div>
        <p className="text-xs text-muted-foreground">
          {dataSufficient ? t.sufficient : t.insufficient}
        </p>
        <h3 className="mt-2 text-base font-semibold leading-6 tracking-tight text-foreground">{title}</h3>
        <p className="mt-2 text-[0.8125rem] leading-6 text-muted-foreground">{body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/interviews/profile" size="sm" variant="outline">
          {t.evidence}
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </ButtonLink>
        <ButtonLink href="/interviews/review" size="sm" variant="ghost">{t.review}</ButtonLink>
      </div>
    </div>
  );
}
