import { NextResponse } from "next/server";

import { validateAiTaskConfig, type AiTaskConfigInput } from "@/lib/ai/config";
import {
  getAiTaskConfig,
  getPublicAiSettings,
  saveAiTaskConfig,
  toPublicAiTaskConfig,
} from "@/lib/settings/ai";

const PRIVATE_RESPONSE_HEADERS = { "Cache-Control": "no-store, private" };

export async function GET() {
  try {
    return NextResponse.json(await getPublicAiSettings(), {
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      { error: "读取 AI 模型设置失败。" },
      { status: 500, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as AiTaskConfigInput;
    if (body.task !== "transcription" && body.task !== "text") {
      return NextResponse.json(
        { error: "未知的 AI 任务类型。" },
        { status: 400, headers: PRIVATE_RESPONSE_HEADERS },
      );
    }

    const existing = await getAiTaskConfig(body.task);
    const parsed = validateAiTaskConfig(
      body,
      existing.provider === body.provider ? existing.apiKey : null,
      Object.hasOwn(body, "apiKey"),
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
      { error: "保存 AI 模型设置失败。" },
      { status: 500, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}
