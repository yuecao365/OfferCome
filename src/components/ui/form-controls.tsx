import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

const fieldControlClassName =
  "block h-8 w-full rounded-control border border-border-strong bg-surface px-2.5 text-[0.8125rem] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

export function FieldLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("grid gap-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

/** 必填标记，与控件的 required 属性配套使用；语义由 required 承担，标记本身只是视觉提示。 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-danger">
      *
    </span>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input className={cn(fieldControlClassName, className)} ref={ref} {...props} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return <select className={cn(fieldControlClassName, className)} ref={ref} {...props} />;
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      className={cn(fieldControlClassName, "h-auto min-h-24 py-2 leading-6", className)}
      ref={ref}
      {...props}
    />
  );
});
