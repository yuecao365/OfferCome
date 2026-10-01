"use client";

import { Monitor } from "lucide-react";

import { navigationMessages } from "@/components/app-navigation-config";
import { PageHeader } from "@/components/page-header";
import { TrialAiConnect } from "@/components/trial/trial-ai-connect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLocale } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";
import { trialAiTokenDocument } from "@/lib/trial/browser-store";
import { useStoredDocument } from "@/lib/trial/stored-document";

const messages = defineMessages({
  "zh-CN": {
    description: "连接你自己的模型服务，即可使用 AI 模拟面试、简历解析与能力画像。Key 只保存在当前浏览器标签页，服务器不存储。",
    localOnlyTitle: "语音转写与联网搜索",
    localOnlyDescription: "这两项依赖本地版的服务端能力（音频处理、文件存储、常驻配置），网页版不提供。",
    localOnlyBody: "本地部署后可在本页分别配置语音转写模型、文本理解模型与联网搜索，API Key 保存在你自己机器的服务端。",
  },
  en: {
    description: "Connect your own model service to use AI mock interviews, resume parsing and the skill profile. Your key stays in this browser tab; the server never stores it.",
    localOnlyTitle: "Transcription and web search",
    localOnlyDescription: "These rely on server features of the local edition (audio processing, file storage, persistent settings), so the web edition doesn't offer them.",
    localOnlyBody: "Once you run it locally, you can configure the transcription model, text model and web search on this page, with API keys stored on your own machine's server.",
  },
});

/**
 * 网页版的设置页：文本模型连接走浏览器方案（Key 换成连接串存在访客
 * 浏览器，服务器不存储），承担与本地版设置页相同的职责。
 * 语音转写与联网搜索依赖服务端常驻配置，网页版不提供。
 */
export function TrialSettingsPage() {
  const aiReady = useStoredDocument(trialAiTokenDocument) !== null;
  const locale = useLocale();
  const t = messages[locale];

  return (
    <>
      <PageHeader
        description={t.description}
        title={navigationMessages[locale].pages.settings}
      />

      <div className="grid gap-5">
        <TrialAiConnect ready={aiReady} />

        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-control bg-muted text-muted-foreground">
              <Monitor aria-hidden="true" className="size-4" />
            </span>
            <div>
              <CardTitle>{t.localOnlyTitle}</CardTitle>
              <CardDescription>
                {t.localOnlyDescription}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t.localOnlyBody}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
