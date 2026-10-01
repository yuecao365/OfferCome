import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { bossBrowserLock } from "@/lib/boss/browser-lock";
import {
  runBossSync,
  toBossSyncPublicResult,
  type BossSyncPublicResult,
} from "@/lib/boss/sync";
import { isLocalBossRequest } from "@/lib/boss/local-request";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";

const messages = defineMessages({
  "zh-CN": { localOnly: "Boss 同步接口仅允许本地访问。" },
  en: { localOnly: "Boss sync is only available from this computer." },
});

export async function POST(request: Request) {
  const locale = await getLocale();
  if (!isLocalBossRequest(request)) {
    return NextResponse.json<BossSyncPublicResult>(
      {
        success: false,
        status: "failed",
        message: messages[locale].localOnly,
      },
      { status: 403 },
    );
  }

  const result = await bossBrowserLock.run(async () => {
    const syncResult = await runBossSync({
      db: prisma,
      locale,
      onMessage: (message) => console.log(`[boss:sync] ${message}`),
      onWarning: (message, error) => {
        const detail = error instanceof Error ? ` ${error.name}: ${error.message}` : "";
        console.warn(`[boss:sync] ${message}${detail}`);
      },
    });

    return toBossSyncPublicResult(syncResult);
  }, locale);

  const statusCode =
    result.status === "login_required"
      ? 401
      : result.status === "failed"
        ? 500
        : 200;

  return NextResponse.json(result, { status: statusCode });
}
