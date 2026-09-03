import { PageNumbers } from "@/components/ui/page-numbers";

/** 列表页脚：左侧计数摘要（等宽数字），右侧页码；所有列表页共用。 */
export function ListPagination({
  page,
  totalPages,
  total,
  unit = "条",
  hrefForPage,
  ariaLabel = "分页",
}: {
  page: number;
  totalPages: number;
  total: number;
  unit?: string;
  hrefForPage: (page: number) => string;
  ariaLabel?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="font-mono tabular-nums">
        共 {total} {unit} · 第 {page} / {Math.max(totalPages, 1)} 页
      </span>
      <PageNumbers
        ariaLabel={`${ariaLabel}页码`}
        hrefForPage={hrefForPage}
        page={page}
        totalPages={totalPages}
      />
    </nav>
  );
}
