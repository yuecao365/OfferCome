import { MessageSquarePlus, Play } from "lucide-react";
import type { ComponentProps } from "react";

import { NewInterviewModal } from "@/components/interviews/interview-modals";
import { ButtonLink, buttonClassName } from "@/components/ui/button";
import type { ApplicationListItem } from "@/lib/applications/types";
import type { ResumeProjectOption } from "@/lib/interviews/types";

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
        triggerTitle="记录面试"
        {...context.newInterview}
      />
      <ButtonLink
        aria-label={`用「${application.companyName} · ${application.jobTitle}」开始 AI 模拟面试`}
        href={`/interviews/mock?applicationId=${encodeURIComponent(application.id)}`}
        size="icon-sm"
        title="AI 模拟面试"
        variant="ghost"
      >
        <Play aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      </ButtonLink>
    </>
  );
}
