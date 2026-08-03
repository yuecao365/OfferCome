"use client";

import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Button, buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ModalSize = "compact" | "default" | "wide" | "extraWide";

const modalWidths: Record<ModalSize, string> = {
  compact: "max-w-2xl",
  default: "max-w-3xl",
  wide: "max-w-4xl",
  extraWide: "max-w-6xl",
};

type ModalProps = {
  title: string;
  triggerLabel?: string;
  triggerClassName?: string;
  size?: ModalSize;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: (close: () => void) => ReactNode;
};

export function Modal({
  title,
  triggerLabel,
  triggerClassName,
  size = "default",
  open: controlledOpen,
  onOpenChange,
  children,
}: ModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const trigger = triggerRef.current;
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    if (scrollbarWidth > 0) {
      const bodyPaddingRight = Number.parseFloat(
        window.getComputedStyle(document.body).paddingRight,
      );
      document.body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    }
    const initialFocus = dialogRef.current?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    (initialFocus ?? closeRef.current)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      document.body.style.paddingRight = previousBodyPaddingRight;
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [open, setOpen]);

  const close = () => setOpen(false);

  return (
    <>
      {triggerLabel ? (
        <button
          className={
            triggerClassName ??
            buttonClassName({ variant: "outline", size: "sm" })
          }
          onClick={() => setOpen(true)}
          ref={triggerRef}
          type="button"
        >
          {triggerLabel}
        </button>
      ) : null}
      {open ? createPortal(
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="modal-overlay fixed inset-0 z-[80] grid place-items-center overflow-hidden overscroll-contain bg-foreground/30 p-4 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          role="dialog"
        >
          <div
            className={cn(
              "modal-panel flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-overlay sm:max-h-[calc(100dvh-3rem)]",
              modalWidths[size],
            )}
            ref={dialogRef}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
              <h2
                className="text-base font-semibold tracking-tight text-foreground"
                id={titleId}
              >
                {title}
              </h2>
              <Button
                aria-label={`关闭“${title}”对话框`}
                onClick={close}
                ref={closeRef}
                size="sm"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
                关闭
              </Button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
              {children(close)}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
