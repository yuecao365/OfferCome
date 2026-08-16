import { NextResponse } from "next/server";

import { bossBrowserLock } from "@/lib/boss/browser-lock";
import type { BossLoginResult } from "@/lib/boss/contracts";
import { runBossLogin } from "@/lib/boss/login";
import { isLocalBossRequest } from "@/lib/boss/local-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isLocalBossRequest(request)) {
    return NextResponse.json<BossLoginResult>(
      {
        success: false,
        status: "failed",
        message: "Boss 登录接口仅允许本地访问。",
      },
      { status: 403 },
    );
  }

  const result = await bossBrowserLock.run<BossLoginResult>(() =>
    runBossLogin({
      onMessage: (message) => console.log(`[boss:login] ${message}`),
    }),
  );

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
