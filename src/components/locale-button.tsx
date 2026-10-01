"use client";

import { Button } from "@/components/ui/button";
import { useLocale, useMessages, useSetLocale } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": { label: "Switch to English", short: "EN" },
  en: { label: "切换到中文", short: "中" },
});

/** 中英切换：放在主题按钮旁边；按钮上写的是"切过去之后"的语言。 */
export function LocaleButton({ className }: { className?: string }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useMessages(messages);
  return (
    <Button
      aria-label={t.label}
      className={className}
      onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}
      size="icon"
      title={t.label}
      variant="ghost"
    >
      <span aria-hidden="true" className="text-xs font-medium">
        {t.short}
      </span>
    </Button>
  );
}
