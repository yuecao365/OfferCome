import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { AiTaskSettingsCard } from "@/components/settings/ai-task-settings-card";
import { WebSearchSettingsCard } from "@/components/settings/web-search-settings-card";
import { getPublicAiSettings } from "@/lib/settings/ai";
import { getWebSearchConfig, toPublicWebSearchConfig } from "@/lib/settings/web-search";

export default async function SettingsPage() {
  await connection();
  const [settings, webSearch] = await Promise.all([
    getPublicAiSettings(),
    getWebSearchConfig(),
  ]);

  return (
    <AppShell active="settings">
      <PageHeader
        description="分别配置语音转写和文本理解模型。API Key 只保存在本机服务端。"
        eyebrow="系统"
        title="设置"
      />

      <div className="grid gap-5">
        <AiTaskSettingsCard initial={settings.transcription} />
        <AiTaskSettingsCard initial={settings.text} />
        <WebSearchSettingsCard initial={toPublicWebSearchConfig(webSearch)} />
      </div>
    </AppShell>
  );
}
