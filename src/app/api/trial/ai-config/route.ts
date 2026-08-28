import { NextResponse } from "next/server";

import { validateAiTaskConfig } from "@/lib/ai/config";
import { testAiConnection } from "@/lib/ai/providers";
import { isTrialMode } from "@/lib/runtime-mode";
import { toPublicAiTaskConfig } from "@/lib/settings/ai";
import {
  TRIAL_AI_COOKIE,
  TRIAL_SESSION_TTL_MS,
  encodeTrialAiCookie,
  getTrialContext,
} from "@/lib/trial/session";

export const runtime = "nodejs";

/**
 * 访客自带 AI Key：校验 + 实测连通后写进 httpOnly cookie。
 * Key 只存在访客浏览器里、随请求带上，服务端不落任何存储。
 */

export async function GET() {
  if (!isTrialMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const context = await getTrialContext();
  return NextResponse.json({
    configured: Boolean(context?.aiConfig),
    config: context?.aiConfig ? toPublicAiTaskConfig(context.aiConfig) : null,
  });
}

export async function POST(request: Request) {
  if (!isTrialMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  // 真实调用一次确认 Key 可用——现在失败好过面试出题时失败。
  try {
    await testAiConnection(validated.value);
  } catch (error) {
    // 只回分类文案：provider 的原始报错可能回显请求信息（含 Key 片段），
    // 不能原样透传给客户端。
    return NextResponse.json(
      { error: describeConnectionFailure(error) },
      { status: 400 },
    );
  }

  const response = NextResponse.json({
    configured: true,
    config: toPublicAiTaskConfig(validated.value),
  });
  response.cookies.set(TRIAL_AI_COOKIE, encodeTrialAiCookie(validated.value), {
    httpOnly: true,
    sameSite: "lax",
    // 见 proxy.ts：按构建环境判断，反代终结 TLS 时按协议判断会漏掉 Secure。
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(TRIAL_SESSION_TTL_MS / 1000),
    // Key cookie 只随 API 请求发送，页面与静态资源不携带，缩小暴露面。
    path: "/api",
  });
  return response;
}

function describeConnectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/\b401\b|unauthorized|invalid[_ ]api[_ ]key|incorrect api key/i.test(message)) {
    return "模型连接测试失败：API Key 无效或无权限，请检查 Key 与服务商是否匹配。";
  }
  if (/\b403\b|forbidden|quota|insufficient/i.test(message)) {
    return "模型连接测试失败：Key 没有权限或额度不足。";
  }
  if (/\b404\b|not found|model.*not.*exist|does not exist/i.test(message)) {
    return "模型连接测试失败：模型名称不存在，请检查拼写。";
  }
  if (/timeout|timed out|abort|econnrefused|fetch failed|network/i.test(message)) {
    return "模型连接测试失败：服务连接超时或不可达，请检查服务地址与网络。";
  }
  return "模型连接测试失败：请检查服务商、模型名称与 Key 后重试。";
}
