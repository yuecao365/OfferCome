import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type BrowserLaunchArgsOptions = {
  userDataDir: string;
  remoteDebuggingPort: number;
  url: string;
};

export type ManualBrowserLaunchArgsOptions = {
  userDataDir: string;
  url: string;
};

export type PickExistingPathDeps = {
  existsSync: (candidate: string) => boolean;
};

export function buildBrowserLaunchArgs({
  userDataDir,
  remoteDebuggingPort,
  url,
}: BrowserLaunchArgsOptions): string[] {
  return [
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--new-window",
    url,
  ];
}

export function buildManualBrowserLaunchArgs({
  userDataDir,
  url,
}: ManualBrowserLaunchArgsOptions): string[] {
  return [
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--new-window",
    url,
  ];
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
