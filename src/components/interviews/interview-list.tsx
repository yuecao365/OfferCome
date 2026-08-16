import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { InterviewListItem, ResumeProjectOption } from "@/lib/interviews/types";
import { roundLabel } from "@/lib/interviews/types";

import { InterviewDeleteButton } from "./interview-delete-button";
import { InterviewDetailsModal } from "./interview-details-modal";
import { EditInterviewModal } from "./interview-modals";
import { InterviewStatusBadge } from "./interview-status-badge";

type InterviewListProps = {
  interviews: InterviewListItem[];
  resumeProjects: ResumeProjectOption[];
};

function formatDateTime(date: Date | null): string {
  if (!date) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function InterviewList({ interviews, resumeProjects }: InterviewListProps) {
  if (interviews.length === 0) {
    return (
      <EmptyState
        description="创建第一条真实面试，或从 AI 模拟面试开始训练。"
        icon={<Sparkles aria-hidden="true" className="size-5" />}
        title="还没有匹配的面试记录"
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead className="bg-surface-subtle text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-4 py-3">公司与岗位</th>
              <th className="px-4 py-3">面试时间</th>
              <th className="px-4 py-3">轮次</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">问题数</th>
              <th className="px-4 py-3">最近更新</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {interviews.map((interview) => (
              <tr className="transition-colors hover:bg-surface-subtle" key={interview.id}>
                <td className="max-w-72 px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-foreground">{interview.companyName}</p>
                    {interview.kind === "mock" ? <Badge tone="brand">AI 模拟</Badge> : null}
                  </div>
                  <p className="mt-1 truncate text-muted-foreground">{interview.jobTitle}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                  {formatDateTime(interview.interviewedAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                  {roundLabel(interview.round)}
                </td>
                <td className="px-4 py-3.5">
                  <InterviewStatusBadge status={interview.status} />
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">{interview.questionCount}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                  {formatDateTime(interview.updatedAt)}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-end gap-1">
                    {interview.status === "scheduled" ? (
                      <ButtonLink href={`/interviews/prepare/${interview.id}`} size="sm" variant="outline">
                        去准备
                      </ButtonLink>
                    ) : null}
                    <InterviewDetailsModal interview={interview} />
                    {interview.kind === "real" ? (
                      <EditInterviewModal interview={interview} resumeProjects={resumeProjects} />
                    ) : interview.mockSessionId ? (
                      <ButtonLink href={`/interviews/mock/${interview.mockSessionId}`} size="sm" variant="outline">
                        打开
                      </ButtonLink>
                    ) : null}
                    <InterviewDeleteButton id={interview.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
