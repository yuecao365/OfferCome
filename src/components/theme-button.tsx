"use client";

import { SunMoon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ThemeButton({ className }: { className?: string }) {
  const toggleTheme = () => {
    const current =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("career-agent-theme", next);
  };

  return (
    <Button
      aria-label="切换浅色或深色主题"
      className={className}
      onClick={toggleTheme}
      size="icon"
      title="切换主题"
      variant="ghost"
    >
      <SunMoon aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </Button>
  );
}
