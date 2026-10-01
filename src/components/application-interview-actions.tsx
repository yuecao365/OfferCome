"use client";

import { MessageSquarePlus, Play } from "lucide-react";
import type { ComponentProps } from "react";

import { NewInterviewModal } from "@/components/interviews/interview-modals";
import { ButtonLink, buttonClassName } from "@/components/ui/button";
import type { ApplicationListItem } from "@/lib/applications/types";
import type { ResumeProjectOption } from "@/lib/interviews/types";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    record: "记录面试",
    mock: "AI 模拟面试",
    mockAria: (target: string) => `用「${target}」开始 AI 模拟面试`,
  },
  en: {
    record: "Record interview",
    mock: "AI mock interview",
    mockAria: (target: string) => `Start an AI mock interview for “${target}”`,
  },
});

export type ApplicationInterviewContext = {
  resumeProjects: ResumeProjectOption[];
  transcriptionConfigured: boolean;
  /** 体验版在此注入浏览器动作与导入开关。 */
  newInterview?: Pick<
    ComponentProps<typeof NewInterviewModal>,
    "action" | "draftImportEnabled"
  >;
};

/**
 * 投递行上的两个面试入口：记录一场已发生的面试，或直接拿这个岗位去练。
 * 两处都会把公司、岗位和投递关联带过去，避免重复输入。
 */
export function ApplicationInterviewActions({
  application,
  context,
}: {
  application: ApplicationListItem;
  context: ApplicationInterviewContext;
}) {
  const t = useMessages(messages);
  return (
    <>
      <NewInterviewModal
        prefill={{
          companyName: application.companyName,
          jobTitle: application.jobTitle,
          applicationId: application.id,
        }}
        resumeProjects={context.resumeProjects}
        transcriptionConfigured={context.transcriptionConfigured}
        triggerClassName={buttonClassName({ variant: "ghost", size: "icon-sm" })}
        triggerLabel={<MessageSquarePlus aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
        triggerTitle={t.record}
        {...context.newInterview}
      />
      <ButtonLink
        aria-label={t.mockAria(`${application.companyName} · ${application.jobTitle}`)}
        href={`/interviews/mock?applicationId=${encodeURIComponent(application.id)}`}
        size="icon-sm"
        title={t.mock}
        variant="ghost"
      >
        <Play aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      </ButtonLink>
    </>
  );
}
