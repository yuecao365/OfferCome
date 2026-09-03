"use client";

import { Monitor } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { TrialAiConnect } from "@/components/trial/trial-ai-connect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trialAiTokenDocument } from "@/lib/trial/browser-store";
import { useStoredDocument } from "@/lib/trial/stored-document";

/**
 * 网页版的设置页：文本模型连接走浏览器方案（Key 换成连接串存在访客
 * 浏览器，服务器不存储），承担与本地版设置页相同的职责。
 * 语音转写与联网搜索依赖服务端常驻配置，网页版不提供。
 */
export function TrialSettingsPage() {
  const aiReady = useStoredDocument(trialAiTokenDocument) !== null;

  return (
    <>
      <PageHeader
        description="连接你自己的模型服务，即可使用 AI 模拟面试、简历解析与能力画像。Key 只保存在当前浏览器标签页，服务器不存储。"
        title="设置"
      />

      <div className="grid gap-5">
        <TrialAiConnect ready={aiReady} />

        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Monitor aria-hidden="true" className="size-4" />
            </span>
            <div>
              <CardTitle>语音转写与联网搜索</CardTitle>
              <CardDescription>
                这两项依赖本地版的服务端能力（音频处理、文件存储、常驻配置），网页版不提供。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            本地部署后可在本页分别配置语音转写模型、文本理解模型与联网搜索，API
            Key 保存在你自己机器的服务端。
          </CardContent>
        </Card>
      </div>
    </>
  );
}
