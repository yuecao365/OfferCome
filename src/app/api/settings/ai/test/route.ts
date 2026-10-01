import { NextResponse } from "next/server";

import { testAiConnection } from "@/lib/ai/providers";
import { validateAiTaskConfig, type AiTaskConfigInput } from "@/lib/ai/config";
import { describeTranscriptionError } from "@/lib/interviews/transcription";
import { getAiTaskConfig } from "@/lib/settings/ai";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale, getMessages } from "@/lib/i18n/server";

const PRIVATE_RESPONSE_HEADERS = { "Cache-Control": "no-store, private" };

const messages = defineMessages({
  "zh-CN": {
    unknownTask: "未知的 AI 任务类型。",
    connected: "连接成功，模型配置可用。",
    failed: "连接测试失败，请检查服务地址、模型名称和 API Key。",
  },
  en: {
    unknownTask: "Unknown AI task type.",
    connected: "Connected. This model configuration works.",
    failed: "Connection test failed. Check the base URL, model name and API key.",
  },
});

export async function POST(request: Request) {
  const t = await getMessages(messages);
  try {
    const body = (await request.json()) as AiTaskConfigInput;
    if (body.task !== "transcription" && body.task !== "text") {
      return NextResponse.json(
        { error: t.unknownTask },
        { status: 400, headers: PRIVATE_RESPONSE_HEADERS },
      );
    }

    const existing = await getAiTaskConfig(body.task);
    const parsed = validateAiTaskConfig(
      body,
      existing.provider === body.provider ? existing.apiKey : null,
      Object.hasOwn(body, "apiKey"),
      await getLocale(),
    );
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.message },
        { status: 400, headers: PRIVATE_RESPONSE_HEADERS },
      );
    }

    await testAiConnection(parsed.value);
    return NextResponse.json(
      { success: true, message: t.connected },
      { headers: PRIVATE_RESPONSE_HEADERS },
    );
  } catch (error) {
    // 响应里不回传服务商原文（可能含账号信息），但服务端必须能看到真实原因，
    // 否则“连接测试失败”对排查毫无帮助。
    console.warn("[settings] AI connection test failed:", describeTranscriptionError(error));
    return NextResponse.json(
      { error: t.failed },
      { status: 502, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}
