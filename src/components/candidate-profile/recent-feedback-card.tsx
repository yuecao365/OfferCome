import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RecentFeedbackItem } from "@/lib/candidate-profile/queries";

type FeedbackEntry = {
  questionId: string;
  question: string;
  companyName: string;
  text: string;
};

function collect(
  items: RecentFeedbackItem[],
  pick: (item: RecentFeedbackItem) => string[],
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
export function RecentFeedbackCard({ items }: { items: RecentFeedbackItem[] }) {
  const strengths = collect(items, (item) => item.strengths, 4);
  const improvements = collect(items, (item) => item.improvements, 4);
  if (strengths.length === 0 && improvements.length === 0) return null;

  return (
    <Card className="grid gap-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">近期定性反馈</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          画像还在积累中，先看最近面试的逐题反馈。多完成几场面试后，这里会变成分组能力画像。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Badge tone="success">做得不错，继续保持</Badge>
          {strengths.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无，多答几题就有了。</p>
          ) : (
            strengths.map((entry) => (
              <p className="text-sm leading-6 text-foreground" key={`${entry.questionId}-${entry.text}`}>
                {entry.text}
                <span className="ml-1 text-xs text-muted-foreground">（{entry.companyName}）</span>
              </p>
            ))
          )}
        </div>
        <div className="grid content-start gap-2">
          <Badge tone="warning">值得再练</Badge>
          {improvements.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无明显短板。</p>
          ) : (
            improvements.map((entry) => (
              <div className="flex items-start justify-between gap-2" key={`${entry.questionId}-${entry.text}`}>
                <p className="min-w-0 text-sm leading-6 text-foreground">
                  {entry.text}
                  <span className="ml-1 text-xs text-muted-foreground">（{entry.companyName}）</span>
                </p>
                <ButtonLink
                  className="shrink-0"
                  href={`/interviews/mock?seedQuestionId=${entry.questionId}`}
                  size="sm"
                  variant="outline"
                >
                  针对练习
                </ButtonLink>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}
