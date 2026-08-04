"use client";

import { Settings2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";

import { Navigation, ProductMark } from "@/components/app-navigation";
import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { Button } from "@/components/ui/button";

export function MobileNavigationDrawer({
  active,
  subActive,
  homeHref,
  open,
  onClose,
  triggerRef,
}: {
  active: AppSection;
  subActive?: InterviewSection;
  homeHref: string;
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;

  return (
    <div className="drawer-overlay fixed inset-0 z-50 lg:hidden">
      <button
        aria-label="关闭主导航"
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label="移动端主导航"
        aria-modal="true"
        className="drawer-panel relative flex h-full w-[min(86vw,320px)] flex-col border-r border-border bg-surface shadow-overlay"
        ref={drawerRef}
        role="dialog"
      >
        <div className="flex h-16 items-center justify-between border-b border-border pr-3">
          <ProductMark homeHref={homeHref} />
          <Button
            aria-label="关闭主导航"
            onClick={onClose}
            ref={closeButtonRef}
            size="icon"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>
        <Navigation
          active={active}
          homeHref={homeHref}
          onNavigate={onClose}
          subActive={subActive}
        />
        <div className="border-t border-border p-3">
          <Link
            className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            href="/settings"
            onClick={onClose}
          >
            <Settings2 aria-hidden="true" className="size-[1.125rem]" />
            设置
          </Link>
        </div>
      </aside>
    </div>
  );
}
