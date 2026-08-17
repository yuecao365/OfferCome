import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
} from "lucide-react";
import Link from "next/link";

import {
  navigationGroups,
  type NavigationItem,
} from "@/components/app-navigation-config";
import type { AppSection, InterviewSection } from "@/components/app-shell-types";
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
        "flex h-16 items-center gap-3 border-b border-border px-4 focus-visible:outline-offset-[-2px]",
        collapsed && "justify-center px-2",
      )}
      href={homeHref}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold tracking-tight text-brand-foreground shadow-card">
        OL
      </span>
      {collapsed ? null : (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
            OfferLai
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            Career Workspace
          </span>
        </span>
      )}
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
    <nav aria-label="主导航" className="flex-1 overflow-y-auto px-3 py-4">
      <div className="grid gap-5">
        {navigationGroups.map((group) => (
          <section key={group.label}>
            <h2
              className={cn(
                "mb-1.5 px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                collapsed && "sr-only",
              )}
            >
              {group.label}
            </h2>
            <div className="grid gap-1">
              {group.items.map((item) => {
                const selected = isItemActive(item, active, subActive);
                const branchSelected = isBranchActive(item, active, subActive);
                const Icon = item.icon;

                return (
                  <div key={item.href}>
                    <Link
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200",
                        selected
                          ? "bg-accent text-accent-foreground"
                          : branchSelected
                            ? "bg-surface-subtle text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        collapsed && "justify-center px-2",
                      )}
                      href={item.href === "/" ? homeHref : item.href}
                      onClick={onNavigate}
                      title={
                        collapsed
                          ? `${item.label}${item.children ? `（含 ${item.children.length} 个子页面）` : ""}`
                          : undefined
                      }
                    >
                      {selected ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand"
                        />
                      ) : null}
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-[1.125rem] shrink-0",
                          branchSelected
                            ? "text-brand"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                        strokeWidth={1.8}
                      />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.children ? (
                            <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
                          ) : null}
                        </>
                      )}
                    </Link>

                    {item.children && !collapsed ? (
                      <div
                        aria-label={`${item.label}子页面`}
                        className="ml-5 mt-1 grid gap-0.5 border-l border-border pl-3"
                        role="group"
                      >
                        {item.children.map((child) => {
                          const childSelected = isItemActive(child, active, subActive);
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              aria-current={childSelected ? "page" : undefined}
                              className={cn(
                                "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors",
                                childSelected
                                  ? "bg-accent text-accent-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                              href={child.href}
                              key={child.href}
                              onClick={onNavigate}
                            >
                              <ChildIcon
                                aria-hidden="true"
                                className={cn(
                                  "size-4 shrink-0",
                                  childSelected ? "text-brand" : "text-muted-foreground",
                                )}
                                strokeWidth={1.8}
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
      <div className="grid gap-1 border-t border-border p-3">
        <Link
          aria-current={active === "settings" ? "page" : undefined}
          className={cn(
            "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
            active === "settings"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-2",
          )}
          href="/settings"
          title={collapsed ? "设置" : undefined}
        >
          <Settings2 aria-hidden="true" className="size-[1.125rem] shrink-0" strokeWidth={1.8} />
          {collapsed ? <span className="sr-only">设置</span> : "设置"}
        </Link>
        <Button
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          className={cn("w-full", !collapsed && "justify-start px-3")}
          onClick={onToggle}
          size={collapsed ? "icon" : "md"}
          title={collapsed ? "展开侧边栏" : undefined}
          variant="ghost"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-[1.125rem]" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="size-[1.125rem]" />
          )}
          {collapsed ? null : "收起侧边栏"}
        </Button>
      </div>
    </aside>
  );
}
