"use client";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import type { EvaluatedQuestion } from "@/lib/mock-interviews/recent-feedback";

const messages = defineMessages({
  "zh-CN": {
    title: "近期定性反馈",
    description: "画像还在积累中，先看最近面试的逐题反馈。多完成几场面试后，这里会变成分组能力画像。",
    keep: "做得不错，继续保持",
    noStrengths: "暂无，多答几题就有了。",
    practice: "值得再练",
    noWeaknesses: "暂无明显短板。",
    company: (name: string) => `（${name}）`,
    targeted: "针对练习",
  },
  en: {
    title: "Recent qualitative feedback",
    description: "Your profile is still building up, so here is per-question feedback from recent interviews. After a few more interviews this becomes a grouped capability profile.",
    keep: "Going well — keep it up",
    noStrengths: "Nothing yet — answer a few more questions.",
    practice: "Worth practicing",
    noWeaknesses: "No clear weak spots.",
    company: (name: string) => `(${name})`,
    targeted: "Practice this",
  },
});

type FeedbackEntry = {
  questionId: string;
  question: string;
  companyName: string;
  text: string;
};

function collect(
  items: EvaluatedQuestion[],
  pick: (item: EvaluatedQuestion) => string[],
  limit: number,
): FeedbackEntry[] {
  const seen = new Set<string>();
  const entries: FeedbackEntry[] = [];
  for (const item of items) {
    for (const text of pick(item)) {
      const key = text.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      entries.push({
        questionId: item.questionId,
        question: item.question,
        companyName: item.companyName,
        text: key,
      });
      if (entries.length >= limit) return entries;
    }
  }
  return entries;
}

/**
 * 冷启动叙事卡：画像还在积累时，直接把最近几场的逐题反馈聚合成
 * "保持什么 / 练什么"，弱点直达针对性练习。零模型调用。
 */
export function RecentFeedbackCard({ items }: { items: EvaluatedQuestion[] }) {
  const t = useMessages(messages);
  const strengths = collect(items, (item) => item.strengths, 4);
  const weaknesses = collect(items, (item) => item.weaknesses.map((weakness) => weakness.point), 4);
  if (strengths.length === 0 && weaknesses.length === 0) return null;

  return (
    <Card className="grid gap-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.description}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Badge tone="success">{t.keep}</Badge>
          {strengths.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noStrengths}</p>
          ) : (
            strengths.map((entry) => (
              <p className="text-sm leading-6 text-foreground" key={`${entry.questionId}-${entry.text}`}>
                {entry.text}
                <span className="ml-1 text-xs text-muted-foreground">{t.company(entry.companyName)}</span>
              </p>
            ))
          )}
        </div>
        <div className="grid content-start gap-2">
          <Badge tone="warning">{t.practice}</Badge>
          {weaknesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noWeaknesses}</p>
          ) : (
            weaknesses.map((entry) => (
              <div className="flex items-start justify-between gap-2" key={`${entry.questionId}-${entry.text}`}>
                <p className="min-w-0 text-sm leading-6 text-foreground">
                  {entry.text}
                  <span className="ml-1 text-xs text-muted-foreground">{t.company(entry.companyName)}</span>
                </p>
                <ButtonLink
                  className="shrink-0"
                  href={`/interviews/mock?seedQuestionId=${entry.questionId}`}
                  size="sm"
                  variant="outline"
                >
                  {t.targeted}
                </ButtonLink>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}
