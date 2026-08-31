import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isDemoMode,
  isPublicDemoPath,
  isTrialMode,
  isTrialWritablePath,
} from "@/lib/runtime-mode";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isRead = ["GET", "HEAD", "OPTIONS"].includes(request.method);

  // 体验模式：服务端完全无状态，访客数据和 AI Key 都在浏览器里。
  // 这里只需要拦住会写服务端数据的入口，读取一律放行。
  if (isTrialMode()) {
    if (isRead || isTrialWritablePath(pathname)) {
      return NextResponse.next();
    }
    // 同时带上 Boss 同步按钮识别的字段（success/status/message），
    // 让共享组件不用感知运行模式就能给出正确提示。
    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error: "在线体验的数据保存在你的浏览器里，此功能请在本地版使用。",
        message: "在线体验的数据保存在你的浏览器里，Boss 同步请在本地版使用。",
      },
      { status: 403 },
    );
  }

  if (!isDemoMode()) {
    return NextResponse.next();
  }

  if (!isRead) {
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
