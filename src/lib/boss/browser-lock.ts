import { defineMessages, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

import { createTaskLock } from "./task-lock";

// 同步和登录共用同一个 CDP 端口和浏览器配置目录，谁先启动都会把端口上
// 已有的浏览器关掉。因此两条流程必须共享同一把锁，绝不能并发。
type BossBrowserBusyResult = {
  success: false;
  status: "failed";
  message: string;
};

const messages = defineMessages({
  "zh-CN": { busy: "Boss 浏览器正在被同步或登录任务使用，请等它完成后再试。" },
  en: { busy: "The Boss browser is busy with a sync or sign-in. Try again when it finishes." },
});

function createBossBrowserLock() {
  return createTaskLock<BossBrowserBusyResult, Locale>((locale = DEFAULT_LOCALE) => ({
    success: false,
    status: "failed",
    message: messages[locale].busy,
  }));
}

const globalForBossBrowser = globalThis as unknown as {
  bossBrowserLock?: ReturnType<typeof createBossBrowserLock>;
};

export const bossBrowserLock =
  globalForBossBrowser.bossBrowserLock ?? createBossBrowserLock();

if (process.env.NODE_ENV !== "production") {
  globalForBossBrowser.bossBrowserLock = bossBrowserLock;
}
