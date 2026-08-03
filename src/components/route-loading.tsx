import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export function RouteLoading({
  active,
  subActive,
  title,
}: {
  active: AppSection;
  subActive?: InterviewSection;
  title: string;
}) {
  return (
    <AppShell active={active} subActive={subActive}>
      <PageHeader description="正在读取本地数据，请稍候。" title={title} />
      <div aria-busy="true" aria-label={`${title}正在加载`} className="grid gap-4" role="status">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-28" key={index} />)}
        </div>
        <Skeleton className="h-72" />
        <span className="sr-only">正在加载</span>
      </div>
    </AppShell>
  );
}
