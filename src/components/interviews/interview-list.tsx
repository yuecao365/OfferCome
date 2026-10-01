"use client";

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
import { useLocale, useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import type { InterviewListItem, ResumeProjectOption } from "@/lib/interviews/types";
import { roundLabel } from "@/lib/interviews/types";

import { InterviewDeleteButton } from "./interview-delete-button";
import { InterviewDetailsModal } from "./interview-details-modal";
import { EditInterviewModal } from "./interview-modals";
import { InterviewStatusBadge } from "./interview-status-badge";

const messages = defineMessages({
  "zh-CN": {
    emptyAction: "开始 AI 模拟面试",
    emptyDescription: "创建第一条真实面试，或从 AI 模拟面试开始训练。",
    emptyTitle: "还没有匹配的面试记录",
    company: "公司与岗位",
    interviewedAt: "面试时间",
    round: "轮次",
    status: "状态",
    questions: "问题",
    updatedAt: "最近更新",
    actions: "操作",
    unset: "未设置",
    prepare: "去准备",
    openMock: "打开模拟面试",
  },
  en: {
    emptyAction: "Start an AI mock interview",
    emptyDescription: "Add your first real interview, or start practicing with an AI mock interview.",
    emptyTitle: "No matching interview records",
    company: "Company and role",
    interviewedAt: "Interview time",
    round: "Round",
    status: "Status",
    questions: "Questions",
    updatedAt: "Last updated",
    actions: "Actions",
    unset: "Not set",
    prepare: "Prepare",
    openMock: "Open mock interview",
  },
});

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
  const locale = useLocale();
  const t = useMessages(messages);
  if (interviews.length === 0) {
    return (
      <EmptyState
        action={<ButtonLink href="/interviews/mock">{t.emptyAction}</ButtonLink>}
        description={t.emptyDescription}
        title={t.emptyTitle}
      />
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <Th>{t.company}</Th>
        <Th>{t.interviewedAt}</Th>
        <Th>{t.round}</Th>
        <Th>{t.status}</Th>
        <Th className="text-right">{t.questions}</Th>
        <Th>{t.updatedAt}</Th>
        <Th className="text-right">
          <span className="sr-only">{t.actions}</span>
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
              <MetaText>{formatShortDateTime(interview.interviewedAt, t.unset, locale)}</MetaText>
            </Td>
            <Td className="whitespace-nowrap text-muted-foreground">{roundLabel(interview.round, locale)}</Td>
            <Td>
              <InterviewStatusBadge status={interview.status} />
            </Td>
            <Td className="text-right">
              <MetaText>{interview.questionCount}</MetaText>
            </Td>
            <Td>
              <MetaText>{formatShortDateTime(interview.updatedAt, t.unset, locale)}</MetaText>
            </Td>
            <Td className="py-2">
              <div className="flex items-center justify-end gap-2">
                {interview.status === "scheduled" ? (
                  <ButtonLink href={`/interviews/prepare/${interview.id}`} size="sm" variant="outline">
                    {t.prepare}
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
                      aria-label={t.openMock}
                      href={`/interviews/mock/${interview.mockSessionId}`}
                      size="icon-sm"
                      title={t.openMock}
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
