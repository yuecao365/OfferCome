"use client";

import { SunMoon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": { label: "切换浅色或深色主题", title: "切换主题" },
  en: { label: "Switch between light and dark theme", title: "Toggle theme" },
});

export function ThemeButton({ className }: { className?: string }) {
  const t = useMessages(messages);
  const toggleTheme = () => {
    const current =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("career-agent-theme", next);
  };

  return (
    <Button
      aria-label={t.label}
      className={className}
      onClick={toggleTheme}
      size="icon"
      title={t.title}
      variant="ghost"
    >
      <SunMoon aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </Button>
  );
}
