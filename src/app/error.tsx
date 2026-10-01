"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    title: "页面加载失败",
    body: "本地数据或服务暂时不可用。可以重试当前操作，或返回数据概览。",
    retry: "重试",
    backToOverview: "返回数据概览",
  },
  en: {
    title: "This page failed to load",
    body: "Local data or a service is temporarily unavailable. Try again, or go back to the overview.",
    retry: "Try again",
    backToOverview: "Back to overview",
  },
});

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useMessages(messages);
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-panel border border-border bg-surface p-8 text-center" role="alert">
        <span className="mx-auto flex size-9 items-center justify-center rounded-full bg-danger-soft text-danger-strong">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">{t.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t.body}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw aria-hidden="true" className="size-4" />
            {t.retry}
          </Button>
          <ButtonLink href="/" variant="outline">{t.backToOverview}</ButtonLink>
        </div>
      </section>
    </main>
  );
}
