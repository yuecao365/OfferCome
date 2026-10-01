"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";

import { Navigation, ProductMark, SettingsLink } from "@/components/app-navigation";
import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": { close: "关闭主导航", drawer: "移动端主导航" },
  en: { close: "Close main navigation", drawer: "Mobile main navigation" },
});

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
  const t = useMessages(messages);

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
        aria-label={t.close}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label={t.drawer}
        aria-modal="true"
        className="drawer-panel relative flex h-full w-[min(86vw,320px)] flex-col border-r border-border bg-surface shadow-overlay"
        ref={drawerRef}
        role="dialog"
      >
        <div className="flex h-12 items-center justify-between border-b border-border pr-2">
          <ProductMark homeHref={homeHref} />
          <Button
            aria-label={t.close}
            onClick={onClose}
            ref={closeButtonRef}
            size="icon"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
        <Navigation
          active={active}
          homeHref={homeHref}
          onNavigate={onClose}
          subActive={subActive}
        />
        <div className="border-t border-border p-3">
          <SettingsLink active={active === "settings"} onNavigate={onClose} />
        </div>
      </aside>
    </div>
  );
}
