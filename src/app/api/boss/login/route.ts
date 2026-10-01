import { NextResponse } from "next/server";

import { bossBrowserLock } from "@/lib/boss/browser-lock";
import type { BossLoginResult } from "@/lib/boss/contracts";
import { runBossLogin } from "@/lib/boss/login";
import { isLocalBossRequest } from "@/lib/boss/local-request";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";

const messages = defineMessages({
  "zh-CN": { localOnly: "Boss 登录接口仅允许本地访问。" },
  en: { localOnly: "Boss sign-in is only available from this computer." },
});

export async function POST(request: Request) {
  const locale = await getLocale();
  if (!isLocalBossRequest(request)) {
    return NextResponse.json<BossLoginResult>(
      {
        success: false,
        status: "failed",
        message: messages[locale].localOnly,
      },
      { status: 403 },
    );
  }

  const result = await bossBrowserLock.run<BossLoginResult>(
    () =>
      runBossLogin({
        locale,
        onMessage: (message) => console.log(`[boss:login] ${message}`),
      }),
    locale,
  );

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
