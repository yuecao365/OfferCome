import { ChevronDown, PanelLeftClose, PanelLeftOpen, Settings2 } from "lucide-react";
import Link from "next/link";

import {
  navigationGroups,
  type NavigationItem,
} from "@/components/app-navigation-config";
import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { ThemeButton } from "@/components/theme-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

function isItemActive(
  item: NavigationItem,
  active: AppSection,
  subActive?: InterviewSection,
): boolean {
  if (item.active === "interviews") {
    return active === "interviews" && !subActive;
  }
  return item.active === (subActive ?? active);
}

function isBranchActive(
  item: NavigationItem,
  active: AppSection,
  subActive?: InterviewSection,
): boolean {
  return (
    isItemActive(item, active, subActive) ||
    Boolean(item.children?.some((child) => isItemActive(child, active, subActive)))
  );
}

/** 导航项统一样式：选中态为浅填充 + 左侧 2px 强调竖条，图标始终单色。 */
function navItemClassName({
  selected,
  collapsed = false,
  compact = false,
}: {
  selected: boolean;
  collapsed?: boolean;
  compact?: boolean;
}): string {
  return cn(
    "group relative flex items-center gap-2.5 rounded-control text-[0.8125rem] transition-colors duration-150",
    compact ? "h-7 px-2" : "h-8 px-2.5",
    selected
      ? "bg-muted font-medium text-foreground"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    collapsed && "justify-center px-0",
  );
}

function ActiveBar() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-y-2 -left-3 w-0.5 rounded-full bg-brand"
    />
  );
}

export function ProductMark({
  collapsed = false,
  homeHref = "/",
}: {
  collapsed?: boolean;
  homeHref?: string;
}) {
  return (
    <Link
      aria-label="返回数据概览"
      className={cn(
        "flex h-12 items-center gap-1.5 px-5 text-sm font-semibold tracking-tight text-foreground focus-visible:outline-offset-[-2px]",
        collapsed && "justify-center px-0",
      )}
      href={homeHref}
    >
      {collapsed ? null : <span>OfferLai</span>}
      <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
    </Link>
  );
}

export function Navigation({
  active,
  subActive,
  collapsed = false,
  homeHref = "/",
  onNavigate,
}: {
  active: AppSection;
  subActive?: InterviewSection;
  collapsed?: boolean;
  homeHref?: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="主导航" className="flex-1 overflow-y-auto px-3 py-3">
      <div className="grid gap-5">
        {navigationGroups.map((group) => (
          <section key={group.label}>
            <h2
              className={cn(
                "mb-1 px-2.5 text-[0.6875rem] font-medium tracking-[0.04em] text-muted-foreground/80",
                collapsed && "sr-only",
              )}
            >
              {group.label}
            </h2>
            <div className="grid gap-px">
              {group.items.map((item) => {
                const selected = isItemActive(item, active, subActive);
                const branchSelected = isBranchActive(item, active, subActive);
                const Icon = item.icon;

                return (
                  <div key={item.href}>
                    <Link
                      aria-current={selected ? "page" : undefined}
                      className={navItemClassName({ selected, collapsed })}
                      href={item.href === "/" ? homeHref : item.href}
                      onClick={onNavigate}
                      title={
                        collapsed
                          ? `${item.label}${item.children ? `（含 ${item.children.length} 个子页面）` : ""}`
                          : undefined
                      }
                    >
                      {selected || (collapsed && branchSelected) ? <ActiveBar /> : null}
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          branchSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                        )}
                        strokeWidth={1.5}
                      />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.children ? (
                            <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                          ) : null}
                        </>
                      )}
                    </Link>

                    {item.children && !collapsed ? (
                      <div
                        aria-label={`${item.label}子页面`}
                        className="ml-[1.125rem] mt-0.5 grid gap-px border-l border-border pl-2.5"
                        role="group"
                      >
                        {item.children.map((child) => {
                          const childSelected = isItemActive(child, active, subActive);
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              aria-current={childSelected ? "page" : undefined}
                              className={navItemClassName({ selected: childSelected, compact: true })}
                              href={child.href}
                              key={child.href}
                              onClick={onNavigate}
                            >
                              <ChildIcon
                                aria-hidden="true"
                                className={cn(
                                  "size-3.5 shrink-0",
                                  childSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                                )}
                                strokeWidth={1.5}
                              />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}

export function SettingsLink({
  active,
  collapsed = false,
  onNavigate,
}: {
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={navItemClassName({ selected: active, collapsed })}
      href="/settings"
      onClick={onNavigate}
      title={collapsed ? "设置" : undefined}
    >
      {active ? <ActiveBar /> : null}
      <Settings2
        aria-hidden="true"
        className={cn("size-4 shrink-0", !active && "text-muted-foreground group-hover:text-foreground")}
        strokeWidth={1.5}
      />
      {collapsed ? <span className="sr-only">设置</span> : "设置"}
    </Link>
  );
}

export function DesktopSidebar({
  active,
  subActive,
  collapsed,
  homeHref,
  onToggle,
}: {
  active: AppSection;
  subActive?: InterviewSection;
  collapsed: boolean;
  homeHref: string;
  onToggle: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-surface-sunken lg:flex">
      <ProductMark collapsed={collapsed} homeHref={homeHref} />
      <Navigation
        active={active}
        collapsed={collapsed}
        homeHref={homeHref}
        subActive={subActive}
      />
      <div className="grid gap-px border-t border-border p-3">
        <SettingsLink active={active === "settings"} collapsed={collapsed} />
        <div className={cn("flex items-center", collapsed ? "flex-col gap-px" : "justify-between")}>
          <ThemeButton />
          <Button
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            onClick={onToggle}
            size="icon"
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            variant="ghost"
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="size-4" strokeWidth={1.5} />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-4" strokeWidth={1.5} />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
