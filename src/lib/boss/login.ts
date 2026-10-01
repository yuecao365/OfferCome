import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import { defineMessages, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

import {
  buildBrowserLaunchArgs,
  findBrowserExecutable,
  launchBrowserProcess,
  stopBrowserProcess,
} from "./browser-launch";
import {
  closeBrowserGracefully,
  ensureBossBrowserClosed,
  getBossCdpPort,
  waitForBrowserAlive,
  waitForBrowserGone,
} from "./cdp";
import type { BossLoginResult } from "./contracts";
import { getBossLocalPaths } from "./paths";

const BOSS_RECOMMEND_URL = "https://www.zhipin.com/web/geek/recommend";
const DEFAULT_LOGIN_TIMEOUT_MS = 10 * 60 * 1_000;

const messages = defineMessages({
  "zh-CN": {
    noBrowser: "未找到 Chrome 或 Edge，无法打开 Boss 登录窗口。",
    launchFailed: "Boss 登录窗口启动失败。",
    timeout: "等待 Boss 登录超时，请重新同步后再试。",
    saved: "登录状态已保存在本地浏览器配置中。",
    failed: "Boss 登录失败。",
  },
  en: {
    noBrowser: "Chrome or Edge not found, so the Boss sign-in window can't open.",
    launchFailed: "The Boss sign-in window failed to start.",
    timeout: "Timed out waiting for Boss sign-in. Sync again to retry.",
    saved: "Sign-in saved in the local browser profile.",
    failed: "Boss sign-in failed.",
  },
});

export type RunBossLoginOptions = {
  // browser-close：等用户关闭登录窗口（网页端流程）；
  // terminal-enter：等终端按 Enter（boss:login 命令行）。
  completion?: "browser-close" | "terminal-enter";
  cwd?: string;
  timeoutMs?: number;
  onMessage?: (message: string) => void;
  /** 返回给界面的文案语言；命令行不传，用默认中文。 */
  locale?: Locale;
};

async function waitForTerminalEnter(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(
      "[boss:login] 登录完成并看到推荐岗位页面后，按 Enter 保存登录态...",
    );
  } finally {
    rl.close();
  }
}

export async function runBossLogin(
  options: RunBossLoginOptions = {},
): Promise<BossLoginResult> {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const t = messages[locale];
  const paths = getBossLocalPaths(options.cwd);
  await mkdir(paths.browserProfileDir, { recursive: true });

  const browserPath = await findBrowserExecutable();
  if (!browserPath) {
    return {
      success: false,
      status: "failed",
      message: t.noBrowser,
    };
  }

  const port = getBossCdpPort();
  let browserProcess: ReturnType<typeof launchBrowserProcess> | null = null;
  try {
    await ensureBossBrowserClosed(port, locale);
    browserProcess = launchBrowserProcess(
      browserPath,
      buildBrowserLaunchArgs({
        userDataDir: paths.browserProfileDir,
        remoteDebuggingPort: port,
        url: BOSS_RECOMMEND_URL,
      }),
    );
    await waitForBrowserAlive(port, 20_000, t.launchFailed);
    options.onMessage?.(
      "Boss 登录窗口已打开。请完成登录，看到推荐岗位页面后关闭整个浏览器窗口。",
    );

    if (options.completion === "terminal-enter") {
      await waitForTerminalEnter();
      if (!(await closeBrowserGracefully(port)) && browserProcess) {
        stopBrowserProcess(browserProcess);
      }
    } else {
      // 用户关闭窗口（调试端口消失）即视为登录完成。
      await waitForBrowserGone(
        port,
        options.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS,
        t.timeout,
      );
    }

    return {
      success: true,
      status: "success",
      message: t.saved,
    };
  } catch (error) {
    if (!(await closeBrowserGracefully(port)) && browserProcess) {
      stopBrowserProcess(browserProcess);
    }
    return {
      success: false,
      status: "failed",
      message: error instanceof Error ? error.message : t.failed,
    };
  }
}
