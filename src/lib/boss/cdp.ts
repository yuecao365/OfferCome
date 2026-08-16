// 极简原生 CDP 客户端。Boss 页面的反爬脚本会检测 Playwright/Puppeteer
// 挂载时启用的 Runtime 域并把页面清空，因此这里只允许使用 Network、DOM、
// Page.navigate 和 Input 事件，绝不能启用 Runtime。
// （DOM 域已实测安全：启用后页面仍能正常加载岗位数据。）

export const DEFAULT_BOSS_CDP_PORT = 9333;

export function getBossCdpPort(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.BOSS_CDP_PORT);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536
    ? parsed
    : DEFAULT_BOSS_CDP_PORT;
}

export type CdpTargetInfo = {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

async function fetchJson<T>(url: string, timeoutMs = 3_000): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  return (await response.json()) as T;
}

export async function isBrowserAlive(port: number): Promise<boolean> {
  try {
    await fetchJson(`http://127.0.0.1:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
}

export async function listPageTargets(port: number): Promise<CdpTargetInfo[]> {
  const targets = await fetchJson<CdpTargetInfo[]>(
    `http://127.0.0.1:${port}/json`,
  );
  return targets.filter((target) => target.type === "page");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForBrowserAlive(
  port: number,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isBrowserAlive(port)) return;
    await sleep(250);
  }
  throw new Error(timeoutMessage);
}

export async function waitForBrowserGone(
  port: number,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isBrowserAlive(port))) return;
    await sleep(500);
  }
  throw new Error(timeoutMessage);
}

type CdpEventHandler = (params: unknown) => void;

type PendingCommand = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

export class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly handlers = new Map<string, Set<CdpEventHandler>>();
  onClose?: () => void;

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      this.handleMessage(String(event.data));
    });
    ws.addEventListener("close", () => this.handleClose());
    ws.addEventListener("error", () => this.handleClose());
  }

  static async connect(wsUrl: string): Promise<CdpClient> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener(
        "error",
        () => reject(new Error(`无法连接 CDP：${wsUrl}`)),
        { once: true },
      );
    });
    return new CdpClient(ws);
  }

  private handleMessage(data: string): void {
    let message: {
      id?: number;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: { message?: string };
    };
    try {
      message = JSON.parse(data) as typeof message;
    } catch {
      return;
    }

    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? "CDP command failed"));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      const handlers = this.handlers.get(message.method);
      if (!handlers) return;
      for (const handler of handlers) handler(message.params);
    }
  }

  private handleClose(): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("CDP connection closed"));
    }
    this.pending.clear();
    this.onClose?.();
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP connection closed"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
  }

  on(method: string, handler: CdpEventHandler): void {
    const handlers = this.handlers.get(method) ?? new Set();
    handlers.add(handler);
    this.handlers.set(method, handlers);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Already closed.
    }
  }

  /** 定位元素，返回 nodeId；找不到返回 null。 */
  async querySelector(selector: string): Promise<number | null> {
    const doc = (await this.send("DOM.getDocument", { depth: 0 })) as {
      root?: { nodeId?: number };
    };
    if (!doc.root?.nodeId) return null;

    const found = (await this.send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    }).catch(() => null)) as { nodeId?: number } | null;
    return found?.nodeId || null;
  }

  /** 读取元素属性，返回 name -> value。 */
  async getAttributes(nodeId: number): Promise<Record<string, string>> {
    const result = (await this.send("DOM.getAttributes", { nodeId }).catch(
      () => null,
    )) as { attributes?: string[] } | null;
    const flat = result?.attributes ?? [];
    const attributes: Record<string, string> = {};
    for (let index = 0; index + 1 < flat.length; index += 2) {
      attributes[flat[index]!] = flat[index + 1]!;
    }
    return attributes;
  }

  /** 滚动元素到可视区域后点击其中心。元素不可见时返回 false。 */
  async clickElement(nodeId: number): Promise<boolean> {
    await this.send("DOM.scrollIntoViewIfNeeded", { nodeId }).catch(
      () => undefined,
    );

    const box = (await this.send("DOM.getBoxModel", { nodeId }).catch(
      () => null,
    )) as { model?: { content?: number[] } } | null;
    const content = box?.model?.content;
    if (!content || content.length < 8) return false;

    const x = (content[0]! + content[4]!) / 2;
    const y = (content[1]! + content[5]!) / 2;
    for (const type of ["mousePressed", "mouseReleased"]) {
      await this.send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        clickCount: 1,
      });
    }
    return true;
  }
}

// 通过 Browser.close 优雅关闭浏览器：Edge/Chrome 启动时可能重新拉起真正的
// 浏览器进程，杀 spawn 句柄不可靠；优雅退出还能保证登录 cookie 落盘。
export async function closeBrowserGracefully(
  port: number,
  timeoutMs = 15_000,
): Promise<boolean> {
  try {
    const version = await fetchJson<{ webSocketDebuggerUrl?: string }>(
      `http://127.0.0.1:${port}/json/version`,
    );
    if (version.webSocketDebuggerUrl) {
      const client = await CdpClient.connect(version.webSocketDebuggerUrl);
      client.send("Browser.close").catch(() => undefined);
      client.close();
    }
  } catch {
    // 浏览器已经不在了。
  }

  try {
    await waitForBrowserGone(port, timeoutMs, "浏览器未按预期退出。");
    return true;
  } catch {
    return false;
  }
}

export async function ensureBossBrowserClosed(port: number): Promise<void> {
  if (!(await isBrowserAlive(port))) return;
  const closed = await closeBrowserGracefully(port);
  if (!closed) {
    throw new Error(
      "检测到已打开的 Boss 浏览器窗口且无法自动关闭，请手动关闭所有 Boss 窗口后重试。",
    );
  }
}
