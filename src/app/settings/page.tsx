import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { AiTaskSettingsCard } from "@/components/settings/ai-task-settings-card";
import { getPublicAiSettings } from "@/lib/settings/ai";
import { TrialSettingsPage } from "@/components/trial/pages/trial-settings-page";
import { isTrialMode } from "@/lib/runtime-mode";

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

  return (
    <AppShell active="settings">
      <PageHeader
        description="分别配置语音转写和文本理解模型。API Key 只保存在本机服务端。"
        title="设置"
      />

      <div className="grid gap-5">
        <AiTaskSettingsCard initial={settings.transcription} />
        <AiTaskSettingsCard initial={settings.text} />
      </div>
    </AppShell>
  );
}
