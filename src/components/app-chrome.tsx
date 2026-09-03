"use client";

import { ArrowLeft, Menu } from "lucide-react";
import { useRef, useState, ViewTransition, type ReactNode } from "react";

import { DesktopSidebar } from "@/components/app-navigation";
import { pageLabels } from "@/components/app-navigation-config";
import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { MobileNavigationDrawer } from "@/components/mobile-navigation-drawer";
import { ThemeButton } from "@/components/theme-button";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";

export function AppChrome({
  active,
  subActive,
  homeHref,
  immersive = false,
  children,
}: {
  active: AppSection;
  subActive?: InterviewSection;
  homeHref: string;
  immersive?: boolean;
  children: ReactNode;
}) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const currentKey = subActive ?? active;
  const showInterviewBackLink =
    !immersive && active === "interviews" && Boolean(subActive);

  return (
    <div
      className={cn(
        "min-h-screen bg-background text-foreground transition-[grid-template-columns] duration-200 ease-move lg:grid",
        collapsed
          ? "lg:grid-cols-[56px_minmax(0,1fr)]"
          : "lg:grid-cols-[240px_minmax(0,1fr)]",
      )}
    >
      <a
        className="fixed left-4 top-3 z-[70] -translate-y-20 rounded-control bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-transform focus:translate-y-0"
        href="#main-content"
      >
        跳到主要内容
      </a>

      <DesktopSidebar
        active={active}
        collapsed={collapsed}
        homeHref={homeHref}
        onToggle={toggleCollapsed}
        subActive={subActive}
      />

      <div className="min-w-0">
        {/* 桌面端没有顶栏：页名由页面标题承担；移动端保留一条用于打开导航 */}
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur lg:hidden">
          <Button
            aria-expanded={mobileOpen}
            aria-label="打开主导航"
            onClick={() => setMobileOpen(true)}
            ref={menuButtonRef}
            size="icon"
            variant="ghost"
          >
            <Menu aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </Button>
          <span className="truncate text-sm font-medium text-foreground">
            {pageLabels[currentKey]}
          </span>
          <ThemeButton className="ml-auto" />
        </header>

        <ViewTransition default="page-swap">
          <main
            className={cn(
              "flex w-full flex-col",
              immersive
                ? "gap-0 px-3 py-3 sm:px-4 lg:px-5 lg:py-4"
                : "mx-auto max-w-[1360px] gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-10",
            )}
            id="main-content"
            key={currentKey}
          >
            {showInterviewBackLink ? (
              <div className="-mb-4 flex">
                <ButtonLink href="/interviews" size="sm" variant="ghost">
                  <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                  面试工作台
                </ButtonLink>
              </div>
            ) : null}
            {children}
          </main>
        </ViewTransition>
      </div>

      <MobileNavigationDrawer
        active={active}
        homeHref={homeHref}
        onClose={() => setMobileOpen(false)}
        open={mobileOpen}
        subActive={subActive}
        triggerRef={menuButtonRef}
      />
    </div>
  );
}
