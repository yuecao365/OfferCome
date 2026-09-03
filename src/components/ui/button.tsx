import Link, { type LinkProps } from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon" | "icon-sm";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-brand bg-brand text-brand-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:border-brand-hover hover:bg-brand-hover",
  secondary:
    "border-transparent bg-accent text-accent-foreground hover:bg-accent-strong",
  outline:
    "border-border-strong bg-surface text-foreground shadow-card hover:bg-surface-subtle",
  ghost:
    "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  danger:
    "border-danger bg-danger text-white hover:border-danger-strong hover:bg-danger-strong",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-8 gap-2 px-3 text-[0.8125rem]",
  icon: "size-8 justify-center p-0",
  "icon-sm": "size-7 justify-center p-0",
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
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-control border font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.97]",
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
  title?: string;
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
