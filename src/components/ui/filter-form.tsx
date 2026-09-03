"use client";

import { useRouter } from "next/navigation";
import { useRef, type FormEvent, type ReactNode } from "react";

function isTextControl(target: EventTarget): boolean {
  return (
    target instanceof HTMLInputElement &&
    (target.type === "search" || target.type === "text")
  );
}

/**
 * 列表筛选表单：控件一变化就把值写进 URL（客户端导航），不需要「应用筛选」按钮。
 * 文本框防抖 300ms；空值和 "all" 不进 URL，保持地址干净。
 * 表单本身仍是 GET，无 JS 时回退为整页提交。
 */
export function FilterForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const timer = useRef<number | undefined>(undefined);

  const navigate = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed || trimmed === "all") continue;
      params.set(key, trimmed);
    }
    const query = params.toString();
    router.replace(query ? `${action}?${query}` : action);
  };

  const handleChange = (event: FormEvent<HTMLFormElement>) => {
    if (isTextControl(event.target)) return;
    navigate(event.currentTarget);
  };

  const handleInput = (event: FormEvent<HTMLFormElement>) => {
    if (!isTextControl(event.target)) return;
    const form = event.currentTarget;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => navigate(form), 300);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.clearTimeout(timer.current);
    navigate(event.currentTarget);
  };

  return (
    <form
      action={action}
      className={className}
      method="get"
      onChange={handleChange}
      onInput={handleInput}
      onSubmit={handleSubmit}
    >
      {children}
    </form>
  );
}
