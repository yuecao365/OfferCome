import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isDemoMode, isPublicDemoPath } from "@/lib/runtime-mode";

export function proxy(request: NextRequest) {
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
