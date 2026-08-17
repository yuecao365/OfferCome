import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

type RouteLoadingVariant = "dashboard" | "list" | "split" | "form";

const variantSkeletons: Record<RouteLoadingVariant, React.ReactNode> = {
  // 指标卡行 + 图表卡 + 双栏卡片，对应数据概览/面试工作台
  dashboard: (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-28" key={index} />
        ))}
      </div>
      <Skeleton className="h-80" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </>
  ),
  // 筛选条 + 记录行，对应投递岗位等列表页
  list: (
    <>
      <Skeleton className="h-24" />
      <div className="grid gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-20" key={index} />
        ))}
      </div>
    </>
  ),
  // 左列表右预览，对应简历中心
  split: (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.6fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="h-24" key={index} />
        ))}
      </div>
      <Skeleton className="h-[32rem]" />
    </div>
  ),
  // 堆叠配置卡，对应设置页
  form: (
    <div className="grid gap-4">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton className="h-56" key={index} />
      ))}
    </div>
  ),
};

export function RouteLoading({
  active,
  subActive,
  title,
  variant = "dashboard",
}: {
  active: AppSection;
  subActive?: InterviewSection;
  title: string;
  variant?: RouteLoadingVariant;
}) {
  return (
    <AppShell active={active} subActive={subActive}>
      <PageHeader description="正在读取本地数据，请稍候。" title={title} />
      <div aria-busy="true" aria-label={`${title}正在加载`} className="grid gap-4" role="status">
        {variantSkeletons[variant]}
        <span className="sr-only">正在加载</span>
      </div>
    </AppShell>
  );
}
