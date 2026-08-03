import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  createBossSyncLock,
  runBossSync,
  toBossSyncPublicResult,
  type BossSyncPublicResult,
} from "@/lib/boss/sync";
import { isLocalBossRequest } from "@/lib/boss/local-request";

export const runtime = "nodejs";

const globalForBossSync = globalThis as unknown as {
  bossSyncLock?: ReturnType<typeof createBossSyncLock>;
};

const bossSyncLock =
  globalForBossSync.bossSyncLock ?? createBossSyncLock();

if (process.env.NODE_ENV !== "production") {
  globalForBossSync.bossSyncLock = bossSyncLock;
}

export async function POST(request: Request) {
  if (!isLocalBossRequest(request)) {
    return NextResponse.json<BossSyncPublicResult>(
      {
        success: false,
        status: "failed",
        message: "Boss 同步接口仅允许本地访问。",
      },
      { status: 403 },
    );
  }

  const result = await bossSyncLock.run(async () => {
    const syncResult = await runBossSync({
      db: prisma,
      onMessage: (message) => console.log(`[boss:sync] ${message}`),
      onWarning: (message, error) => {
        const detail = error instanceof Error ? ` ${error.name}: ${error.message}` : "";
        console.warn(`[boss:sync] ${message}${detail}`);
      },
    });

    return toBossSyncPublicResult(syncResult);
  });

  const statusCode =
    result.status === "login_required"
      ? 401
      : result.status === "failed"
        ? 500
        : 200;

  return NextResponse.json(result, { status: statusCode });
}
