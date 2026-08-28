import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isDemoMode,
  isPublicDemoPath,
  isTrialMode,
  isTrialWritablePath,
} from "@/lib/runtime-mode";

// 与 lib/trial/session.ts 保持一致。不直接 import：那个模块用了
// node:async_hooks，proxy 的运行时不保证可用。
const TRIAL_SESSION_COOKIE = "offerlai_trial_sid";
const TRIAL_SESSION_TTL_SECONDS = 2 * 60 * 60;

/**
 * 体验模式：读路径全放开（每个会话有自己的临时库，看到的是示例数据 +
 * 自己创建的内容）；写路径只开放模拟面试链路。会话 cookie 在这里发放——
 * 首个请求同时改写转发头，让同一次渲染就能解析到会话。
 */
function trialProxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const method = request.method;
  const hasSession = Boolean(request.cookies.get(TRIAL_SESSION_COOKIE)?.value);

  if (
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    !isTrialWritablePath(pathname)
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "体验模式仅开放 AI 模拟面试相关操作，其余功能请在本地版使用。",
      },
      { status: 403 },
    );
  }

  if (hasSession) {
    return NextResponse.next();
  }

  // 首次访问：生成会话 id。写进响应 cookie 之外，还要改写本次转发的请求头，
  // 否则当前这一次渲染读不到会话、页面会直接失败。
  const sessionId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  const existingCookie = requestHeaders.get("cookie");
  requestHeaders.set(
    "cookie",
    existingCookie
      ? `${existingCookie}; ${TRIAL_SESSION_COOKIE}=${sessionId}`
      : `${TRIAL_SESSION_COOKIE}=${sessionId}`,
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(TRIAL_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    // 按构建环境而不是按请求协议判断：生产部署常见 TLS 在反代终结，
    // 应用看到的是 http，按协议判断会漏掉 Secure。
    secure: process.env.NODE_ENV === "production",
    maxAge: TRIAL_SESSION_TTL_SECONDS,
    path: "/",
  });
  return response;
}

export function proxy(request: NextRequest) {
  if (isTrialMode()) {
    return trialProxy(request);
  }

  if (!isDemoMode()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return NextResponse.json(
      { success: false, message: "在线体验环境为只读模式，不会保存任何数据。" },
      { status: 403 },
    );
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, message: "演示环境不提供数据接口。" },
      { status: 404 },
    );
  }

  if (pathname === "/homepage") {
    return NextResponse.rewrite(new URL("/", request.url));
  }

  if (isPublicDemoPath(pathname)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/showcase", request.url));
}
