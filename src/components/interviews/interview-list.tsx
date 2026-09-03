import { ArrowUpRight } from "lucide-react";
import type { ComponentProps } from "react";

import { ButtonLink } from "@/components/ui/button";
import {
  DataRow,
  DataTable,
  DataTableBody,
  DataTableHead,
  MetaText,
  RowActions,
  Td,
  Th,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatShortDateTime } from "@/lib/format/date";
import type { InterviewListItem, ResumeProjectOption } from "@/lib/interviews/types";
import { roundLabel } from "@/lib/interviews/types";

import { InterviewDeleteButton } from "./interview-delete-button";
import { InterviewDetailsModal } from "./interview-details-modal";
import { EditInterviewModal } from "./interview-modals";
import { InterviewStatusBadge } from "./interview-status-badge";

type InterviewListProps = {
  interviews: InterviewListItem[];
  resumeProjects: ResumeProjectOption[];
  /** 覆盖默认 Server Action（体验版传浏览器实现），按记录 id 绑定。 */
  editActionFor?: (id: string) => ComponentProps<typeof EditInterviewModal>["action"];
  deleteActionFor?: (id: string) => (formData: FormData) => Promise<void>;
};

/** 模拟面试的来源标记：等宽小字，不用彩色药丸。 */
export function MockTag() {
  return (
    <span className="rounded-control border border-border px-1 font-mono text-[0.625rem] leading-4 text-muted-foreground">
      AI
    </span>
  );
}

export function InterviewList({
  interviews,
  resumeProjects,
  editActionFor,
  deleteActionFor,
}: InterviewListProps) {
  if (interviews.length === 0) {
    return (
      <EmptyState
        action={<ButtonLink href="/interviews/mock">开始 AI 模拟面试</ButtonLink>}
        description="创建第一条真实面试，或从 AI 模拟面试开始训练。"
        title="还没有匹配的面试记录"
      />
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <Th>公司与岗位</Th>
        <Th>面试时间</Th>
        <Th>轮次</Th>
        <Th>状态</Th>
        <Th className="text-right">问题</Th>
        <Th>最近更新</Th>
        <Th className="text-right">
          <span className="sr-only">操作</span>
        </Th>
      </DataTableHead>
      <DataTableBody>
        {interviews.map((interview) => (
          <DataRow key={interview.id}>
            <Td className="max-w-72">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-foreground">{interview.companyName}</p>
                {interview.kind === "mock" ? <MockTag /> : null}
              </div>
              <p className="mt-0.5 truncate text-muted-foreground">{interview.jobTitle}</p>
            </Td>
            <Td>
              <MetaText>{formatShortDateTime(interview.interviewedAt, "未设置")}</MetaText>
            </Td>
            <Td className="whitespace-nowrap text-muted-foreground">{roundLabel(interview.round)}</Td>
            <Td>
              <InterviewStatusBadge status={interview.status} />
            </Td>
            <Td className="text-right">
              <MetaText>{interview.questionCount}</MetaText>
            </Td>
            <Td>
              <MetaText>{formatShortDateTime(interview.updatedAt, "未设置")}</MetaText>
            </Td>
            <Td className="py-2">
              <div className="flex items-center justify-end gap-2">
                {interview.status === "scheduled" ? (
                  <ButtonLink href={`/interviews/prepare/${interview.id}`} size="sm" variant="outline">
                    去准备
                  </ButtonLink>
                ) : null}
                <RowActions>
                  <InterviewDetailsModal interview={interview} />
                  {interview.kind === "real" ? (
                    <EditInterviewModal
                      action={editActionFor?.(interview.id)}
                      interview={interview}
                      resumeProjects={resumeProjects}
                    />
                  ) : interview.mockSessionId ? (
                    <ButtonLink
                      aria-label="打开模拟面试"
                      href={`/interviews/mock/${interview.mockSessionId}`}
                      size="icon-sm"
                      title="打开模拟面试"
                      variant="ghost"
                    >
                      <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                    </ButtonLink>
                  ) : null}
                  <InterviewDeleteButton
                    action={deleteActionFor?.(interview.id)}
                    id={interview.id}
                  />
                </RowActions>
              </div>
            </Td>
          </DataRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
