import { ChevronLeft, ChevronRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** 当前页两侧各保留几个相邻页码。 */
const ADJACENT_PAGES = 2;

/** 计算要展示的页码序列，null 表示省略号。 */
export function pageNumberItems(
  page: number,
  totalPages: number,
): Array<number | null> {
  const wanted = new Set<number>([1, totalPages]);
  for (let offset = -ADJACENT_PAGES; offset <= ADJACENT_PAGES; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= totalPages) wanted.add(candidate);
  }
  const ordered = [...wanted].sort((left, right) => left - right);
  const items: Array<number | null> = [];
  for (const [index, value] of ordered.entries()) {
    const previous = ordered[index - 1];
    if (previous !== undefined && value - previous > 1) items.push(null);
    items.push(value);
  }
  return items;
}

/**
 * 编号分页：首末页 + 当前页相邻 2 页 + 省略号 + 上/下一页。
 * 所有列表页共用，href 由调用方按自己的筛选参数生成。
 */
export function PageNumbers({
  page,
  totalPages,
  hrefForPage,
  ariaLabel = "分页",
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
  ariaLabel?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
      <ButtonLink
        aria-disabled={page <= 1}
        aria-label="上一页"
        className={page <= 1 ? "pointer-events-none opacity-40" : undefined}
        href={hrefForPage(Math.max(1, page - 1))}
        size="sm"
        variant="outline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
      </ButtonLink>
      {pageNumberItems(page, totalPages).map((item, index) =>
        item === null ? (
          <span className="px-1 text-sm text-muted-foreground" key={`gap-${index}`}>
            …
          </span>
        ) : (
          <ButtonLink
            aria-current={item === page ? "page" : undefined}
            className={cn("min-w-9 justify-center", item === page && "pointer-events-none")}
            href={hrefForPage(item)}
            key={item}
            size="sm"
            variant={item === page ? "primary" : "outline"}
          >
            {item}
          </ButtonLink>
        ),
      )}
      <ButtonLink
        aria-disabled={page >= totalPages}
        aria-label="下一页"
        className={page >= totalPages ? "pointer-events-none opacity-40" : undefined}
        href={hrefForPage(Math.min(totalPages, page + 1))}
        size="sm"
        variant="outline"
      >
        <ChevronRight aria-hidden="true" className="size-4" />
      </ButtonLink>
    </nav>
  );
}
