import { NextResponse } from "next/server";

import { testAiConnection } from "@/lib/ai/providers";
import { validateAiTaskConfig, type AiTaskConfigInput } from "@/lib/ai/config";
import { describeTranscriptionError } from "@/lib/interviews/transcription";
import { getAiTaskConfig } from "@/lib/settings/ai";

const PRIVATE_RESPONSE_HEADERS = { "Cache-Control": "no-store, private" };

export async function POST(request: Request) {
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

    await testAiConnection(parsed.value);
    return NextResponse.json(
      { success: true, message: "连接成功，模型配置可用。" },
      { headers: PRIVATE_RESPONSE_HEADERS },
    );
  } catch (error) {
    // 响应里不回传服务商原文（可能含账号信息），但服务端必须能看到真实原因，
    // 否则“连接测试失败”对排查毫无帮助。
    console.warn("[settings] AI connection test failed:", describeTranscriptionError(error));
    return NextResponse.json(
      { error: "连接测试失败，请检查服务地址、模型名称和 API Key。" },
      { status: 502, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}
