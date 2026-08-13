"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form-controls";

type Strategy = "supplement" | "enrich" | "proceed";

export function MockInterviewJdReview({
  sessionId,
  jobTitle,
  review,
}: {
  sessionId: string;
  jobTitle: string;
  review: {
    missingInformation: string[];
    canSupplement: boolean;
  };
}) {
  const router = useRouter();
  const [additionalText, setAdditionalText] = useState("");
  const [showSupplement, setShowSupplement] = useState(false);
  const [pending, setPending] = useState<Strategy | null>(null);
  const [error, setError] = useState("");

  async function choose(strategy: Strategy) {
    setPending(strategy);
    setError("");
    try {
      const response = await fetch(`/api/interviews/mock/${sessionId}/jd-strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, additionalText }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "处理岗位描述失败。");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "处理岗位描述失败。");
      setPending(null);
    }
  }

  return (
    <Card className="grid gap-5 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">这份岗位描述还缺少一些信息</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {review.missingInformation.length > 0
            ? `缺少：${review.missingInformation.join("、")}`
            : "可提取的具体岗位职责和任职要求较少。"}
        </p>
      </div>

      {showSupplement && review.canSupplement ? (
        <div className="grid gap-3">
          <Textarea
            onChange={(event) => setAdditionalText(event.target.value)}
            placeholder="补充岗位职责、任职要求或技术栈……"
            value={additionalText}
          />
          <Button
            disabled={!additionalText.trim() || pending !== null}
            onClick={() => choose("supplement")}
            type="button"
          >
            {pending === "supplement" ? "正在重新分析…" : "提交补充内容"}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {review.canSupplement && !showSupplement ? (
          <Button onClick={() => setShowSupplement(true)} type="button" variant="outline">
            我来补充
          </Button>
        ) : null}
        <Button disabled={pending !== null} onClick={() => choose("enrich")} type="button">
          {pending === "enrich" ? "正在补全…" : `让 AI 补全“${jobTitle}”的常见要求`}
        </Button>
        <Button
          disabled={pending !== null}
          onClick={() => choose("proceed")}
          type="button"
          variant="outline"
        >
          就用现有内容出题
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Card>
  );
}
