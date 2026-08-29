import { NextResponse } from "next/server";

import { validateAiTaskConfig } from "@/lib/ai/config";
import { testAiConnection } from "@/lib/ai/providers";
import { isTrialMode } from "@/lib/runtime-mode";
import { encodeTrialAiConfig } from "@/lib/trial/ai-config";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * 校验访客自带的模型配置并实测一次连通性，通过后返回编码串。
 *
 * **服务端不保存它**——由浏览器存进 sessionStorage，之后随每个请求的
 * 请求头带上。现在失败好过面试出题时才失败。
 */
export async function POST(request: Request) {
  if (!isTrialMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const validated = validateAiTaskConfig(
    {
      task: "text",
      provider: body.provider,
      model: body.model,
      baseURL: body.baseURL,
      apiKey: body.apiKey,
    },
    typeof body.apiKey === "string" ? body.apiKey : null,
    true,
  );
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message }, { status: 400 });
  }

  try {
    await testAiConnection(validated.value);
  } catch (error) {
    // 只回分类文案：provider 的原始报错可能回显请求信息（含 Key 片段）。
    return NextResponse.json(
      { error: describeConnectionFailure(error) },
      { status: 400 },
    );
  }

  return NextResponse.json({
    token: encodeTrialAiConfig(validated.value),
    provider: validated.value.provider,
    model: validated.value.model,
  });
}

function describeConnectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/\b401\b|unauthorized|invalid[_ ]api[_ ]key|incorrect api key/i.test(message)) {
    return "连接失败：API Key 无效或无权限，请检查 Key 与服务商是否匹配。";
  }
  if (/\b403\b|forbidden|quota|insufficient/i.test(message)) {
    return "连接失败：Key 没有权限或额度不足。";
  }
  if (/\b404\b|not found|model.*not.*exist|does not exist/i.test(message)) {
    return "连接失败：模型名称不存在，请检查拼写。";
  }
  if (/timeout|timed out|abort|econnrefused|fetch failed|network/i.test(message)) {
    return "连接失败：服务连接超时或不可达，请检查服务地址与网络。";
  }
  return "连接失败：请检查服务商、模型名称与 Key 后重试。";
}
