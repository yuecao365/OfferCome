import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isDemoMode } from "@/lib/runtime-mode";

const PUBLIC_DEMO_PATHS = new Set([
  "/showcase",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

export function proxy(request: NextRequest) {
  if (!isDemoMode()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (
    PUBLIC_DEMO_PATHS.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/showcase/")
  ) {
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
