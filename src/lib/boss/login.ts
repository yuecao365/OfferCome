import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import type { Browser, BrowserContext } from "playwright";

import {
  buildBrowserLaunchArgs,
  buildManualBrowserLaunchArgs,
  findBrowserExecutable,
} from "./browser-launch";
import {
  connectOverCdp,
  launchBrowserProcess,
  stopBrowserProcess,
  waitForBrowserClose,
} from "./browser-session";
import type { BossLoginResult } from "./contracts";
import { getBossLocalPaths } from "./paths";

const BOSS_HOME_URL = "https://www.zhipin.com/";
const DEFAULT_LOGIN_TIMEOUT_MS = 10 * 60 * 1_000;

export type BossLoginCompletion = "browser-close" | "terminal-enter";

export type RunBossLoginOptions = {
  completion: BossLoginCompletion;
  cwd?: string;
  timeoutMs?: number;
  onMessage?: (message: string) => void;
};

async function waitForTerminalEnter(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(
      "[boss:login] 登录完成后关闭浏览器窗口，再按 Enter 保存登录态...",
    );
  } finally {
    rl.close();
  }
}

async function saveStorageState(
  context: BrowserContext,
  storageStatePath: string,
): Promise<void> {
  await context.storageState({ path: storageStatePath });
}

async function exportStorageState(input: {
  browserPath: string;
  browserProfileDir: string;
  storageStatePath: string;
}): Promise<void> {
  const cdpPort = Number(process.env.BOSS_CDP_PORT ?? 9333);
  const browserProcess = launchBrowserProcess(
    input.browserPath,
    buildBrowserLaunchArgs({
      userDataDir: input.browserProfileDir,
      remoteDebuggingPort: cdpPort,
      url: "about:blank",
    }),
  );
  let browser: Browser | null = null;

  try {
    browser = await connectOverCdp(cdpPort);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("登录态导出浏览器没有可用的上下文。");
    }
    await saveStorageState(context, input.storageStatePath);
  } finally {
    await browser?.close().catch(() => undefined);
    stopBrowserProcess(browserProcess);
  }
}

export async function runBossLogin(
  options: RunBossLoginOptions,
): Promise<BossLoginResult> {
  const paths = getBossLocalPaths(options.cwd);
  await mkdir(paths.browserProfileDir, { recursive: true });

  const browserPath = await findBrowserExecutable();
  if (!browserPath) {
    return {
      success: false,
      status: "failed",
      message: "未找到 Chrome 或 Edge，无法打开 Boss 登录窗口。",
    };
  }

  const browserProcess = launchBrowserProcess(
    browserPath,
    buildManualBrowserLaunchArgs({
      userDataDir: paths.browserProfileDir,
      url: BOSS_HOME_URL,
    }),
  );

  try {
    options.onMessage?.(`登录浏览器已打开：${BOSS_HOME_URL}`);
    options.onMessage?.("请手动完成登录、扫码、验证码或安全校验。登录完成后关闭该浏览器窗口。");

    if (options.completion === "terminal-enter") {
      await waitForTerminalEnter();
    } else {
      await waitForBrowserClose(
        browserProcess,
        options.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS,
        "等待 Boss 登录超时，请重新点击同步后再试。",
      );
    }

    stopBrowserProcess(browserProcess);
    await waitForBrowserClose(
      browserProcess,
      5_000,
      "等待登录浏览器关闭超时。",
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await exportStorageState({
      browserPath,
      browserProfileDir: paths.browserProfileDir,
      storageStatePath: paths.storageStatePath,
    });

    return {
      success: true,
      status: "success",
      message: "Boss 登录态已刷新。",
    };
  } catch (error) {
    return {
      success: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Boss 登录失败，请稍后重试。",
    };
  } finally {
    stopBrowserProcess(browserProcess);
  }
}
