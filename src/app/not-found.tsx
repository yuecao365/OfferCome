import { SearchX } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-border bg-surface p-8 text-center shadow-card">
        <SearchX aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
        <h1 className="mt-5 text-xl font-semibold">没有找到这个页面</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">链接可能已经失效，或对应记录已被删除。</p>
        <ButtonLink className="mt-6" href="/">返回数据概览</ButtonLink>
      </section>
    </main>
  );
}
