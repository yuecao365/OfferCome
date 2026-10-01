import { SearchX } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";

const messages = defineMessages({
  "zh-CN": {
    title: "没有找到这个页面",
    body: "链接可能已经失效，或对应记录已被删除。",
    backToOverview: "返回数据概览",
  },
  en: {
    title: "Page not found",
    body: "The link may be out of date, or the record it pointed to was deleted.",
    backToOverview: "Back to overview",
  },
});

export default async function NotFound() {
  const t = await getMessages(messages);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-panel border border-border bg-surface p-8 text-center">
        <SearchX aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
        <h1 className="mt-5 text-xl font-semibold">{t.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.body}</p>
        <ButtonLink className="mt-6" href="/">{t.backToOverview}</ButtonLink>
      </section>
    </main>
  );
}
