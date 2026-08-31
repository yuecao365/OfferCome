import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isTrialMode, isTrialWritablePath } from "@/lib/runtime-mode";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isRead = ["GET", "HEAD", "OPTIONS"].includes(request.method);

  // 网页版：服务端完全无状态，访客数据和 AI Key 都在浏览器里。
  // 这里只需要拦住会写服务端数据的入口，读取一律放行。
  if (isTrialMode()) {
    // 与本地版一致的产品路由，唯一不同：根域名先落宣传页，
    // "进入产品"后工作台挂在 /homepage 上。
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/showcase", request.url));
    }
    if (pathname === "/homepage") {
      return NextResponse.rewrite(new URL("/", request.url));
    }
    // 历史入口（早期的独立准备页）并入设置页。
    if (pathname === "/trial") {
      return NextResponse.redirect(new URL("/settings", request.url));
    }
    if (isRead || isTrialWritablePath(pathname)) {
      return NextResponse.next();
    }
    // 同时带上 Boss 同步按钮识别的字段（success/status/message），
    // 让共享组件不用感知运行模式就能给出正确提示。
    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error: "网页版的数据保存在你的浏览器里，此功能请在本地版使用。",
        message: "网页版的数据保存在你的浏览器里，Boss 同步请在本地版使用。",
      },
      { status: 403 },
    );
  }

  return NextResponse.next();
}
