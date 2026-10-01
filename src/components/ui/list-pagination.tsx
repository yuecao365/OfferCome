import { PageNumbers } from "@/components/ui/page-numbers";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    unit: "条",
    pagination: "分页",
    pageNumbers: (label: string) => `${label}页码`,
    summary: (total: number, unit: string, page: number, pages: number) => `共 ${total} ${unit} · 第 ${page} / ${pages} 页`,
  },
  en: {
    unit: "items",
    pagination: "Pagination",
    pageNumbers: (label: string) => `${label} page numbers`,
    summary: (total: number, unit: string, page: number, pages: number) => `${total} ${unit} · Page ${page} of ${pages}`,
  },
});

/**
 * 列表页脚：左侧计数摘要（等宽数字），右侧页码；所有列表页共用。
 * 用了语言 hook、又收 hrefForPage 函数，只能在客户端组件里渲染。
 */
export function ListPagination({
  page,
  totalPages,
  total,
  unit,
  hrefForPage,
  ariaLabel,
}: {
  page: number;
  totalPages: number;
  total: number;
  unit?: string;
  hrefForPage: (page: number) => string;
  ariaLabel?: string;
}) {
  const t = useMessages(messages);
  const label = ariaLabel ?? t.pagination;
  return (
    <nav
      aria-label={label}
      className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="font-mono tabular-nums">
        {t.summary(total, unit ?? t.unit, page, Math.max(totalPages, 1))}
      </span>
      <PageNumbers
        ariaLabel={t.pageNumbers(label)}
        hrefForPage={hrefForPage}
        page={page}
        totalPages={totalPages}
      />
    </nav>
  );
}
