import Link, { type LinkProps } from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-brand bg-brand text-brand-foreground hover:border-brand-hover hover:bg-brand-hover",
  secondary:
    "border-accent bg-accent text-accent-foreground hover:border-brand/20 hover:bg-accent-strong",
  outline:
    "border-border-strong bg-surface text-foreground hover:border-brand/40 hover:bg-surface-subtle",
  ghost:
    "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  danger:
    "border-danger bg-danger text-brand-foreground hover:border-danger-strong hover:bg-danger-strong",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
  icon: "size-10 justify-center p-0",
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-lg border font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:translate-y-px",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, type = "button", ...props },
    ref,
  ) {
    return (
      <button
        className={buttonClassName({ variant, size, className })}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);

type ButtonLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  "aria-label"?: string;
};

export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}
