import { spawn, type ChildProcess } from "node:child_process";

import { chromium, type Browser } from "playwright";

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

export function stopBrowserProcess(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
}

export async function waitForBrowserClose(
  browserProcess: ChildProcess,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<void> {
  if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) {
    if (browserProcess.exitCode === 0 || browserProcess.signalCode !== null) {
      return;
    }
    throw new Error(`浏览器异常退出（code=${browserProcess.exitCode}）。`);
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      browserProcess.off("error", onError);
      browserProcess.off("exit", onExit);
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    function onExit(code: number | null) {
      cleanup();
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(new Error(`浏览器异常退出（code=${code}）。`));
    }

    browserProcess.once("error", onError);
    browserProcess.once("exit", onExit);
  });
}

export async function connectOverCdp(port: number): Promise<Browser> {
  const endpoint = `http://127.0.0.1:${port}`;
  let lastError: unknown;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await chromium.connectOverCDP(endpoint);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`无法连接浏览器：${String(lastError)}`);
}
