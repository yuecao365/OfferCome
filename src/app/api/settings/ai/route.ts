import { NextResponse } from "next/server";

import { validateAiTaskConfig, type AiTaskConfigInput } from "@/lib/ai/config";
import {
  getAiTaskConfig,
  getPublicAiSettings,
  saveAiTaskConfig,
  toPublicAiTaskConfig,
} from "@/lib/settings/ai";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale, getMessages } from "@/lib/i18n/server";

const PRIVATE_RESPONSE_HEADERS = { "Cache-Control": "no-store, private" };

const messages = defineMessages({
  "zh-CN": {
    loadFailed: "读取 AI 模型设置失败。",
    unknownTask: "未知的 AI 任务类型。",
    saveFailed: "保存 AI 模型设置失败。",
  },
  en: {
    loadFailed: "Couldn't load AI model settings.",
    unknownTask: "Unknown AI task type.",
    saveFailed: "Couldn't save AI model settings.",
  },
});

export async function GET() {
  const t = await getMessages(messages);
  try {
    return NextResponse.json(await getPublicAiSettings(), {
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      { error: t.loadFailed },
      { status: 500, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}

export async function PUT(request: Request) {
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

    await saveAiTaskConfig(parsed.value);
    return NextResponse.json(toPublicAiTaskConfig(parsed.value), {
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      { error: t.saveFailed },
      { status: 500, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}
