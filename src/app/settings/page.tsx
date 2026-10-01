import { connection } from "next/server";

import { navigationMessages } from "@/components/app-navigation-config";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { AiSettingsOverview } from "@/components/settings/ai-settings-overview";
import { AiTaskSettingsCard } from "@/components/settings/ai-task-settings-card";
import { getPublicAiSettings } from "@/lib/settings/ai";
import { TrialSettingsPage } from "@/components/trial/pages/trial-settings-page";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { isTrialMode } from "@/lib/runtime-mode";

const messages = defineMessages({
  "zh-CN": { description: "分别配置语音转写、文本理解和面试评分模型。API Key 只保存在本机服务端。" },
  en: { description: "Configure the models for transcription, text understanding and interview scoring. API keys stay on this machine's server." },
});

export default async function SettingsPage() {
  if (isTrialMode()) {
    return (
      <AppShell active="settings">
        <TrialSettingsPage />
      </AppShell>
    );
  }

  await connection();
  const settings = await getPublicAiSettings();
  const locale = await getLocale();

  return (
    <AppShell active="settings">
      <PageHeader
        description={messages[locale].description}
        title={navigationMessages[locale].pages.settings}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)] xl:items-start">
        <AiSettingsOverview settings={settings} />
        <div className="grid gap-4">
          <AiTaskSettingsCard initial={settings.text} />
          <AiTaskSettingsCard initial={settings.scoring} />
          <AiTaskSettingsCard initial={settings.transcription} />
        </div>
      </div>
    </AppShell>
  );
}
