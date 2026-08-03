import { NextResponse } from "next/server";

import type { BossLoginResult } from "@/lib/boss/contracts";
import { runBossLogin } from "@/lib/boss/login";
import { isLocalBossRequest } from "@/lib/boss/local-request";
import { createTaskLock } from "@/lib/boss/task-lock";

export const runtime = "nodejs";

const globalForBossLogin = globalThis as unknown as {
  bossLoginLock?: ReturnType<typeof createBossLoginLock>;
};

function createBossLoginLock() {
  return createTaskLock<BossLoginResult>(() => ({
    success: false,
    status: "failed",
    message: "Boss 登录窗口已经打开，请先在该窗口完成登录。",
  }));
}

const bossLoginLock =
  globalForBossLogin.bossLoginLock ?? createBossLoginLock();

if (process.env.NODE_ENV !== "production") {
  globalForBossLogin.bossLoginLock = bossLoginLock;
}

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

  const result = await bossLoginLock.run(() =>
    runBossLogin({
      completion: "browser-close",
      onMessage: (message) => console.log(`[boss:login] ${message}`),
    }),
  );

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
