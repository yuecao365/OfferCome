import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isDemoMode, isPublicDemoPath } from "@/lib/runtime-mode";

export function proxy(request: NextRequest) {
  if (!isDemoMode()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicDemoPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, message: "演示环境不提供数据接口。" },
      { status: 404 },
    );
  }

  return NextResponse.redirect(new URL("/showcase", request.url));
}
