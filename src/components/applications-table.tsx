import { ExternalLink } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import type { ApplicationListItem } from "@/lib/applications/types";

import {
  ApplicationInterviewActions,
  type ApplicationInterviewContext,
} from "./application-interview-actions";
import { EditApplicationModal } from "./application-modals";
import { ApplicationDeleteButton } from "./application-delete-button";
import { StageBadge } from "./stage-badge";

type ApplicationsTableProps = {
  applications: ApplicationListItem[];
  interviewContext: ApplicationInterviewContext;
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function JobTitle({ application }: { application: ApplicationListItem }) {
  if (!application.jobUrl) {
    return <span>{application.jobTitle}</span>;
  }

  return (
    <a
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand"
      href={application.jobUrl}
      rel="noreferrer"
      target="_blank"
    >
      {application.jobTitle}
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only">（在新窗口打开岗位链接）</span>
    </a>
  );
}

function ApplicationStage({ application }: { application: ApplicationListItem }) {
  return (
    <div className="grid justify-items-start gap-1.5">
      <StageBadge stage={application.stage} />
      {application.autoRejectedAt ? (
        <span className="text-xs text-danger-strong">投递 30 天无后续活动，自动标记</span>
      ) : null}
    </div>
  );
}

function ApplicationCards({
  applications,
  interviewContext,
}: ApplicationsTableProps) {
  return (
    <div className="grid gap-3 md:hidden">
      {applications.map((application) => (
        <article className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-card" key={application.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {application.companyName}
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                <JobTitle application={application} />
              </p>
            </div>
            <ApplicationStage application={application} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">投递时间</dt>
              <dd className="mt-1 font-medium text-foreground">{formatDateTime(application.appliedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">来源</dt>
              <dd className="mt-1 font-medium text-foreground">{application.source}</dd>
            </div>
          </dl>
          {application.note ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {application.note}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-end gap-1 border-t border-border pt-3">
            <ApplicationInterviewActions
              application={application}
              context={interviewContext}
            />
            <EditApplicationModal application={application} />
            <ApplicationDeleteButton id={application.id} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function ApplicationsTable({
  applications,
  interviewContext,
}: ApplicationsTableProps) {
  if (applications.length === 0) {
    return (
      <EmptyState
        description="尝试清空筛选条件，或同步最新的 Boss 直聘记录。"
        title="没有匹配的岗位"
      />
    );
  }

  return (
    <>
      <ApplicationCards
        applications={applications}
        interviewContext={interviewContext}
      />
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead className="bg-surface-subtle text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">公司与岗位</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">投递时间</th>
                <th className="px-4 py-3">来源</th>
                <th className="px-4 py-3">状态更新</th>
                <th className="px-4 py-3">备注</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {applications.map((application) => (
                <tr className="transition-colors hover:bg-surface-subtle" key={application.id}>
                  <td className="max-w-72 px-4 py-3.5">
                    <p className="truncate font-semibold text-foreground">
                      {application.companyName}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      <JobTitle application={application} />
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <ApplicationStage application={application} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                    {formatDateTime(application.appliedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                    {application.source}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                    {formatDateTime(application.statusUpdatedAt)}
                  </td>
                  <td className="max-w-56 px-4 py-3.5 text-muted-foreground">
                    <span className="line-clamp-2" title={application.note || undefined}>
                      {application.note || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <ApplicationInterviewActions
                        application={application}
                        context={interviewContext}
                      />
                      <EditApplicationModal application={application} />
                      <ApplicationDeleteButton id={application.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
