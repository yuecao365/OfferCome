"use client";

import { MockInterviewTraceView } from "@/components/interviews/mock-interview-trace-view";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { trialInterviewsDocument } from "@/lib/trial/browser-store";
import { trialInterviewToTrace } from "@/lib/trial/mock-view";
import { useStoredDocument } from "@/lib/trial/stored-document";

/** 网页版的决策记录页：决策记录随回合结果存在会话文档里，渲染与本地版同一个视图（没有模型开销两列）。 */
export function TrialMockTracePage({ id }: { id: string }) {
  const table = useStoredDocument(trialInterviewsDocument);
  if (!table) return null;
  const trace = table[id] ? trialInterviewToTrace(table[id]) : null;
  if (!trace) {
    return (
      <EmptyState
        action={<ButtonLink href="/interviews/mock">返回模拟面试列表</ButtonLink>}
        description="这场面试不在当前浏览器中，或者还没有备课完成。"
        title="没有决策记录"
      />
    );
  }
  return <MockInterviewTraceView trace={trace} />;
}
