import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type BrowserLaunchArgsOptions = {
  userDataDir: string;
  remoteDebuggingPort: number;
  url: string;
  // 屏幕外窗口用于后台同步，避免打扰用户；不用 headless 是因为 Boss 风控
  // 能识别 HeadlessChrome，普通窗口才和手动浏览完全一致。
  offScreen?: boolean;
};

export type PickExistingPathDeps = {
  existsSync: (candidate: string) => boolean;
};

export function buildBrowserLaunchArgs({
  userDataDir,
  remoteDebuggingPort,
  url,
  offScreen = false,
}: BrowserLaunchArgsOptions): string[] {
  return [
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    ...(offScreen
      ? [
          "--window-position=-32000,-32000",
          "--window-size=1400,900",
          // 屏幕外窗口会被判定为被遮挡，需关掉渲染降频，滚动加载才正常。
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
        ]
      : []),
    "--new-window",
    url,
  ];
}

export function launchBrowserProcess(
  browserPath: string,
  args: string[],
): ChildProcess {
  return spawn(browserPath, args, {
    detached: false,
    stdio: "ignore",
    windowsHide: false,
  });
}

/**
 * 优雅关闭（Browser.close）失败后的兜底。杀 spawn 句柄在浏览器复用已有
 * 进程时可能落空，但离屏窗口用户无法手动关闭，能杀掉一种情况就少一次
 * “请手动关闭 Boss 窗口”的死胡同。
 */
export function stopBrowserProcess(child: ChildProcess): void {
  try {
    child.kill();
  } catch {
    // 进程已退出。
  }
}

export function pickExistingPath(
  candidates: string[],
  deps: PickExistingPathDeps = { existsSync },
): string | null {
  return (
    candidates.find((candidate) =>
      deps.existsSync(/* turbopackIgnore: true */ candidate),
    ) ?? null
  );
}

function windowsPath(base: string | undefined, relativePath: string) {
  return base ? `${base}\\${relativePath}` : undefined;
}

export function getBrowserPathCandidates(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const candidates = [
    env.BOSS_BROWSER_EXECUTABLE,
    windowsPath(
      env.LOCALAPPDATA,
      "Google\\Chrome\\Application\\chrome.exe",
    ),
    windowsPath(env.PROGRAMFILES, "Google\\Chrome\\Application\\chrome.exe"),
    windowsPath(
      env["PROGRAMFILES(X86)"],
      "Google\\Chrome\\Application\\chrome.exe",
    ),
    windowsPath(
      env.LOCALAPPDATA,
      "Microsoft\\Edge\\Application\\msedge.exe",
    ),
    windowsPath(
      env.PROGRAMFILES,
      "Microsoft\\Edge\\Application\\msedge.exe",
    ),
    windowsPath(
      env["PROGRAMFILES(X86)"],
      "Microsoft\\Edge\\Application\\msedge.exe",
    ),
  ];

  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

async function findWithWhere(command: string): Promise<string | null> {
  if (os.platform() !== "win32") {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("where.exe", [command], {
      timeout: 5_000,
      windowsHide: true,
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null;
  } catch {
    return null;
  }
}

function parseRegQueryPath(output: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/REG_SZ\s+(.+?\.exe)\s*$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

async function findWithRegistry(appName: string): Promise<string | null> {
  if (os.platform() !== "win32") {
    return null;
  }

  const keys = [
    `HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${appName}`,
    `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${appName}`,
  ];

  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync("reg.exe", ["query", key, "/ve"], {
        timeout: 5_000,
        windowsHide: true,
      });
      const browserPath = parseRegQueryPath(stdout);

      if (
        browserPath &&
        existsSync(/* turbopackIgnore: true */ browserPath)
      ) {
        return browserPath;
      }
    } catch {
      // Try the next registry key.
    }
  }

  return null;
}

export async function findBrowserExecutable(): Promise<string | null> {
  const directPath = pickExistingPath(getBrowserPathCandidates());

  if (directPath) {
    return directPath;
  }

  for (const command of ["chrome.exe", "msedge.exe"]) {
    const fromWhere = await findWithWhere(command);
    if (fromWhere && existsSync(/* turbopackIgnore: true */ fromWhere)) {
      return fromWhere;
    }

    const fromRegistry = await findWithRegistry(command);
    if (fromRegistry) {
      return fromRegistry;
    }
  }

  return null;
}
