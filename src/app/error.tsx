"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-border bg-surface p-8 text-center shadow-card" role="alert">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger-strong">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">页面加载失败</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          本地数据或服务暂时不可用。可以重试当前操作，或返回数据概览。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw aria-hidden="true" className="size-4" />
            重试
          </Button>
          <ButtonLink href="/" variant="outline">返回数据概览</ButtonLink>
        </div>
      </section>
    </main>
  );
}
