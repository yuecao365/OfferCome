"use client";

import { ArrowLeft, ChevronRight, Menu } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

import { DesktopSidebar } from "@/components/app-navigation";
import { pageLabels } from "@/components/app-navigation-config";
import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { MobileNavigationDrawer } from "@/components/mobile-navigation-drawer";
import { ThemeButton } from "@/components/theme-button";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function AppChrome({
  active,
  subActive,
  immersive = false,
  children,
}: {
  active: AppSection;
  subActive?: InterviewSection;
  immersive?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const currentKey = subActive ?? active;
  const showInterviewBackLink =
    !immersive && active === "interviews" && Boolean(subActive);

  return (
    <div
      className={cn(
        "min-h-screen bg-background text-foreground transition-[grid-template-columns] duration-200 lg:grid",
        collapsed
          ? "lg:grid-cols-[80px_minmax(0,1fr)]"
          : "lg:grid-cols-[256px_minmax(0,1fr)]",
      )}
    >
      <a
        className="fixed left-4 top-3 z-[70] -translate-y-20 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-transform focus:translate-y-0"
        href="#main-content"
      >
        跳到主要内容
      </a>

      <DesktopSidebar
        active={active}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        subActive={subActive}
      />

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              aria-expanded={mobileOpen}
              aria-label="打开主导航"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              ref={menuButtonRef}
              size="icon"
              variant="ghost"
            >
              <Menu aria-hidden="true" className="size-5" />
            </Button>
            <nav aria-label="面包屑" className="flex min-w-0 items-center gap-2 text-sm">
              {subActive ? (
                <>
                  <Link className="hidden text-muted-foreground hover:text-foreground sm:inline" href="/interviews">
                    面试
                  </Link>
                  <ChevronRight aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
                </>
              ) : (
                <span className="hidden text-muted-foreground sm:inline">
                  Career Workspace
                </span>
              )}
              <span className="truncate font-semibold text-foreground">
                {pageLabels[currentKey]}
              </span>
            </nav>
          </div>
          <ThemeButton />
        </header>

        <main
          className={cn(
            "page-content flex w-full flex-col",
            immersive
              ? "gap-0 px-3 py-3 sm:px-4 lg:px-5 lg:py-4"
              : "mx-auto max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
          )}
          id="main-content"
          key={currentKey}
        >
          {showInterviewBackLink ? (
            <div className="flex">
              <ButtonLink href="/interviews" size="sm" variant="ghost">
                <ArrowLeft aria-hidden="true" className="size-4" />
                返回面试工作台
              </ButtonLink>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <MobileNavigationDrawer
        active={active}
        onClose={() => setMobileOpen(false)}
        open={mobileOpen}
        subActive={subActive}
        triggerRef={menuButtonRef}
      />
    </div>
  );
}
