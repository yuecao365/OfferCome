import { ExternalLink } from "lucide-react";
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
import type { ApplicationListItem } from "@/lib/applications/types";
import { formatShortDateTime } from "@/lib/format/date";

import {
  ApplicationInterviewActions,
  type ApplicationInterviewContext,
} from "./application-interview-actions";
import { EditApplicationModal } from "./application-modals";
import { ApplicationDeleteButton } from "./application-delete-button";
import { StageBadge } from "./stage-badge";

type ApplicationsTableProps = {
  applications: ApplicationListItem[];
  /** 体验版没有面试录入入口时传 null。 */
  interviewContext: ApplicationInterviewContext | null;
  /** 覆盖默认 Server Action（体验版传浏览器实现），按记录 id 绑定。 */
  editActionFor?: (id: string) => ComponentProps<typeof EditApplicationModal>["action"];
  deleteActionFor?: (id: string) => (formData: FormData) => Promise<void>;
};

function JobTitle({ application }: { application: ApplicationListItem }) {
  if (!application.jobUrl) {
    return <span>{application.jobTitle}</span>;
  }

  return (
    <a
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      href={application.jobUrl}
      rel="noreferrer"
      target="_blank"
    >
      {application.jobTitle}
      <ExternalLink aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
      <span className="sr-only">（在新窗口打开岗位链接）</span>
    </a>
  );
}

function ApplicationStage({ application }: { application: ApplicationListItem }) {
  return (
    <div className="grid justify-items-start gap-1">
      <StageBadge stage={application.stage} />
      {application.autoRejectedAt ? (
        <span className="whitespace-nowrap text-[0.6875rem] text-danger-strong" title="投递 30 天无后续活动，自动标记为拒绝">30 天无活动自动标记</span>
      ) : null}
    </div>
  );
}

function ApplicationActions({
  application,
  interviewContext,
  editActionFor,
  deleteActionFor,
}: Omit<ApplicationsTableProps, "applications"> & { application: ApplicationListItem }) {
  return (
    <>
      {interviewContext ? (
        <ApplicationInterviewActions application={application} context={interviewContext} />
      ) : null}
      <EditApplicationModal action={editActionFor?.(application.id)} application={application} />
      <ApplicationDeleteButton action={deleteActionFor?.(application.id)} id={application.id} />
    </>
  );
}

function ApplicationCards({ applications, ...rest }: ApplicationsTableProps) {
  return (
    <div className="grid gap-2 md:hidden">
      {applications.map((application) => (
        <article
          className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface p-4"
          key={application.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-medium text-foreground">
                {application.companyName}
              </h2>
              <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
                <JobTitle application={application} />
              </p>
            </div>
            <ApplicationStage application={application} />
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">投递</dt>
              <dd><MetaText className="text-foreground">{formatShortDateTime(application.appliedAt)}</MetaText></dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">来源</dt>
              <dd><MetaText className="text-foreground">{application.source}</MetaText></dd>
            </div>
          </dl>
          {application.note ? (
            <p className="mt-3 line-clamp-2 text-[0.8125rem] leading-5 text-muted-foreground">
              {application.note}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap justify-end gap-0.5 border-t border-border pt-3">
            <ApplicationActions application={application} {...rest} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function ApplicationsTable(props: ApplicationsTableProps) {
  const { applications, ...rest } = props;

  if (applications.length === 0) {
    return (
      <EmptyState
        action={
          <ButtonLink href="/applications" variant="outline">
            清空全部筛选
          </ButtonLink>
        }
        description="尝试清空筛选条件，或同步最新的 Boss 直聘记录。"
        title="没有匹配的岗位"
      />
    );
  }

  return (
    <>
      <ApplicationCards {...props} />
      <DataTable className="hidden md:block">
        <DataTableHead>
          <Th>公司与岗位</Th>
          <Th>状态</Th>
          <Th>投递时间</Th>
          <Th>来源</Th>
          <Th>状态更新</Th>
          <Th>备注</Th>
          <Th className="text-right">
            <span className="sr-only">操作</span>
          </Th>
        </DataTableHead>
        <DataTableBody>
          {applications.map((application) => (
            <DataRow key={application.id}>
              <Td className="max-w-72">
                <p className="truncate font-medium text-foreground">{application.companyName}</p>
                <p className="mt-0.5 truncate text-muted-foreground">
                  <JobTitle application={application} />
                </p>
              </Td>
              <Td>
                <ApplicationStage application={application} />
              </Td>
              <Td>
                <MetaText>{formatShortDateTime(application.appliedAt)}</MetaText>
              </Td>
              <Td>
                <MetaText>{application.source}</MetaText>
              </Td>
              <Td>
                <MetaText>{formatShortDateTime(application.statusUpdatedAt)}</MetaText>
              </Td>
              <Td className="max-w-56 text-muted-foreground">
                <span className="line-clamp-2" title={application.note || undefined}>
                  {application.note || "—"}
                </span>
              </Td>
              <Td className="py-2">
                <RowActions>
                  <ApplicationActions application={application} {...rest} />
                </RowActions>
              </Td>
            </DataRow>
          ))}
        </DataTableBody>
      </DataTable>
    </>
  );
}
