import { existsSync } from "node:fs";
import { createServer } from "node:net";

import type { BrowserContext, Locator, Page, Response } from "playwright";

import {
  getBossApiCode,
  getBossApiMessage,
  getBossHasMore,
  isBossLoginRequiredResponse,
} from "./api-response";
import { extractBossContactCandidatesFromApiPayload } from "./api-parse";
import {
  buildBrowserLaunchArgs,
  findBrowserExecutable,
} from "./browser-launch";
import {
  connectOverCdp,
  launchBrowserProcess,
  stopBrowserProcess,
} from "./browser-session";
import {
  buildBossContactExtractionExpression,
  type BossDomExtractionResult,
} from "./dom-extract";
import {
  normalizeBossContacts,
  type BossContactCandidate,
  type NormalizedBossContact,
} from "./parse";
import { getBossLocalPaths } from "./paths";
import type { BossSyncStopReason } from "./sync-policy";

const BOSS_RECOMMEND_URL = "https://www.zhipin.com/web/geek/recommend";
const BOSS_JOB_RESPONSE_PATH = "/wapi/zprelation/interaction/geekGetJob";
const DEFAULT_PAGE_SETTLE_MS = 2_000;
const DEFAULT_LOGIN_TIMEOUT_MS = 10 * 60 * 1_000;
const RESPONSE_TIMEOUT_MS = 12_000;

const NEXT_PAGE_SELECTORS = [
  "button:has-text('下一页')",
  "a:has-text('下一页')",
  "[aria-label*='下一页']",
  ".pagination-next",
  ".btn-next",
  "[class*='pagination'] [class*='next']",
  ".options-pages a:last-child",
] as const;

export type BossBrowserPageDiagnostics = {
  page: number;
  url: string;
  candidateCount: number;
  collectionSource: "browser";
};

export type BossBrowserCollectionResult = {
  contacts: NormalizedBossContact[];
  diagnostics: BossBrowserPageDiagnostics[];
  stopReason: BossSyncStopReason | null;
};

export type CollectBossContactsOptions = {
  cwd?: string;
  maxPages: number;
  pageSettleMs?: number;
  loginTimeoutMs?: number;
  onMessage?: (message: string) => void;
};

export class BossBrowserLoginRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BossBrowserLoginRequiredError";
  }
}

export class BossBrowserClosedError extends Error {
  constructor(message = "Boss 同步窗口已关闭。请重新同步，并在读取完成前保持窗口打开。") {
    super(message);
    this.name = "BossBrowserClosedError";
  }
}

type ManualLoginWaitInput = {
  timeoutMs: number;
  isClosed: () => boolean;
  isLoginRequired: () => Promise<boolean>;
  delay?: (durationMs: number) => Promise<void>;
  now?: () => number;
  onMessage?: (message: string) => void;
};

export async function waitForManualBossLogin(
  input: ManualLoginWaitInput,
): Promise<void> {
  const now = input.now ?? Date.now;
  const delay =
    input.delay ??
    ((durationMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, durationMs)));
  const deadline = now() + input.timeoutMs;

  input.onMessage?.(
    "Boss 需要登录或安全验证。请在已打开的窗口中手动完成，完成后不要关闭窗口，同步会自动继续。",
  );

  while (now() < deadline) {
    if (input.isClosed()) throw new BossBrowserClosedError();
    if (!(await input.isLoginRequired())) return;
    await delay(500);
  }

  throw new BossBrowserLoginRequiredError(
    "等待 Boss 登录或安全验证超时，请重新同步后再试。",
  );
}

function isTargetClosedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /target page, context or browser has been closed|page has been closed|browser has been closed/i.test(
      error.message,
    )
  );
}

function assertBossAccessAvailable(
  issue: { code: number | null; message: string } | null,
  duringSync = false,
): void {
  if (!issue) return;
  if (isBossLoginRequiredResponse(issue.code, issue.message)) {
    throw new BossBrowserLoginRequiredError(
      duringSync
        ? "Boss 在同步过程中要求重新登录或安全校验，已停止继续读取。"
        : "Boss 要求重新登录或安全校验，请按浏览器页面提示手动处理。",
    );
  }

  throw new Error(
    `Boss 页面返回异常响应${issue.code === null ? "" : `（code=${issue.code}）`}，已停止同步。`,
  );
}

function isBossJobResponse(response: Response): boolean {
  return response.url().includes(BOSS_JOB_RESPONSE_PATH);
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("无法分配浏览器调试端口。"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function extractDomCandidates(page: Page): Promise<BossContactCandidate[]> {
  const result = (await page.evaluate(
    buildBossContactExtractionExpression(),
  )) as BossDomExtractionResult;
  return result.candidates;
}

async function findNextPageControl(page: Page): Promise<Locator | null> {
  for (const selector of NEXT_PAGE_SELECTORS) {
    const controls = page.locator(selector);
    const count = await controls.count();
    if (count === 0) continue;

    const control = controls.nth(count - 1);
    if (!(await control.isVisible().catch(() => false))) continue;

    const [disabled, ariaDisabled, className] = await Promise.all([
      control.isDisabled().catch(() => false),
      control.getAttribute("aria-disabled"),
      control.getAttribute("class"),
    ]);
    if (
      disabled ||
      ariaDisabled === "true" ||
      /(?:^|\s)(?:disabled|is-disabled)(?:\s|$)/i.test(className ?? "")
    ) {
      return null;
    }

    return control;
  }

  return null;
}

async function looksLikeLoginPage(page: Page): Promise<boolean> {
  if (/\/(?:login|web\/user)(?:\/|\?|$)/i.test(page.url())) return true;

  return page
    .getByText(/扫码登录|手机号登录|验证码登录/, { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
}

async function getBossAuthSignature(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies("https://www.zhipin.com/");
  return cookies
    .filter((cookie) => cookie.name === "wt2" || cookie.name === "zp_at")
    .map((cookie) => `${cookie.name}:${cookie.value}`)
    .sort()
    .join("|");
}

export async function collectBossContactsFromBrowser(
  options: CollectBossContactsOptions,
): Promise<BossBrowserCollectionResult> {
  const paths = getBossLocalPaths(options.cwd);
  if (!existsSync(paths.browserProfileDir)) {
    throw new BossBrowserLoginRequiredError(
      "尚未创建 Boss 浏览器登录状态，请先完成手动登录。",
    );
  }

  const browserPath = await findBrowserExecutable();
  if (!browserPath) {
    throw new Error("未找到 Chrome 或 Edge，无法启动 Boss 浏览器同步。" );
  }

  const cdpPort = await getAvailablePort();
  const browserProcess = launchBrowserProcess(
    browserPath,
    buildBrowserLaunchArgs({
      userDataDir: paths.browserProfileDir,
      remoteDebuggingPort: cdpPort,
      url: BOSS_RECOMMEND_URL,
    }),
  );
  let browser = null as Awaited<ReturnType<typeof connectOverCdp>> | null;
  let page: Page | null = null;

  try {
    browser = await connectOverCdp(cdpPort);
    const context = browser.contexts()[0];
    if (!context) throw new Error("Boss 同步浏览器没有可用上下文。" );

    page =
      context.pages().find((candidate) => candidate.url() !== "about:blank") ??
      context.pages()[0] ??
      (await context.newPage());
    const candidates: BossContactCandidate[] = [];
    const responseTasks: Promise<void>[] = [];
    let hasMore: boolean | null = null;
    const accessIssue: {
      current: { code: number | null; message: string } | null;
    } = { current: null };

    page.on("response", (response) => {
      if (!isBossJobResponse(response)) return;

      const task = response
        .json()
        .then((payload: unknown) => {
          const code = getBossApiCode(payload);
          const message = getBossApiMessage(payload);
          if (code !== null && code !== 0) {
            accessIssue.current = { code, message };
            return;
          }

          accessIssue.current = null;
          candidates.push(...extractBossContactCandidatesFromApiPayload(payload));
          hasMore = getBossHasMore(payload);
        })
        .catch(() => undefined);
      responseTasks.push(task);
    });

    options.onMessage?.("已打开 Boss 岗位页面，正在通过浏览器读取投递记录。" );
    const initialResponse = page
      .waitForResponse(isBossJobResponse, { timeout: RESPONSE_TIMEOUT_MS })
      .catch(() => null);
    if (page.url() !== BOSS_RECOMMEND_URL) {
      await page.goto(BOSS_RECOMMEND_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
    }
    await initialResponse;
    await Promise.all(responseTasks);

    const initialAccessIssue = accessIssue.current;
    const needsManualLogin =
      (await looksLikeLoginPage(page)) ||
      Boolean(
        initialAccessIssue &&
          isBossLoginRequiredResponse(
            initialAccessIssue.code,
            initialAccessIssue.message,
          ),
      );
    if (needsManualLogin) {
      const initialAuthSignature = await getBossAuthSignature(context);
      await waitForManualBossLogin({
        timeoutMs: options.loginTimeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS,
        isClosed: () => page?.isClosed() ?? true,
        isLoginRequired: async () => {
          const pageStillRequiresLogin = await looksLikeLoginPage(page!);
          if (pageStillRequiresLogin) return true;
          const issue = accessIssue.current;
          if (!issue || !isBossLoginRequiredResponse(issue.code, issue.message)) {
            return false;
          }
          return (await getBossAuthSignature(context)) === initialAuthSignature;
        },
        onMessage: options.onMessage,
      });
      accessIssue.current = null;
      const retryResponse = page
        .waitForResponse(isBossJobResponse, { timeout: RESPONSE_TIMEOUT_MS })
        .catch(() => null);
      await page.goto(BOSS_RECOMMEND_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await retryResponse;
      await Promise.all(responseTasks);
    }
    candidates.push(...(await extractDomCandidates(page)));
    assertBossAccessAvailable(accessIssue.current);

    const diagnostics: BossBrowserPageDiagnostics[] = [];
    let stopReason: BossSyncStopReason | null = null;
    let knownCount = normalizeBossContacts(candidates).length;
    diagnostics.push({
      page: 1,
      url: page.url(),
      candidateCount: knownCount,
      collectionSource: "browser",
    });

    for (let pageNumber = 2; pageNumber <= options.maxPages; pageNumber += 1) {
      if (hasMore === false) {
        stopReason = "no-more-pages";
        break;
      }

      const nextControl = await findNextPageControl(page);
      const naturalResponse = page
        .waitForResponse(isBossJobResponse, { timeout: RESPONSE_TIMEOUT_MS })
        .catch(() => null);

      if (nextControl) {
        await nextControl.click();
      } else {
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      }

      await naturalResponse;
      await new Promise((resolve) =>
        setTimeout(resolve, options.pageSettleMs ?? DEFAULT_PAGE_SETTLE_MS),
      );
      if (page.isClosed()) throw new BossBrowserClosedError();
      await Promise.all(responseTasks);
      candidates.push(...(await extractDomCandidates(page)));

      if (await looksLikeLoginPage(page)) {
        throw new BossBrowserLoginRequiredError(
          "Boss 在同步过程中要求重新登录或安全校验，已停止继续读取。",
        );
      }
      assertBossAccessAvailable(accessIssue.current, true);

      const nextCount = normalizeBossContacts(candidates).length;
      diagnostics.push({
        page: pageNumber,
        url: page.url(),
        candidateCount: Math.max(0, nextCount - knownCount),
        collectionSource: "browser",
      });

      if (nextCount === knownCount) {
        stopReason = "no-more-pages";
        break;
      }
      knownCount = nextCount;

      if (pageNumber >= options.maxPages) {
        stopReason = "max-pages";
      }
    }

    return {
      contacts: normalizeBossContacts(candidates),
      diagnostics,
      stopReason,
    };
  } catch (error) {
    if (
      error instanceof BossBrowserLoginRequiredError ||
      error instanceof BossBrowserClosedError
    ) {
      throw error;
    }
    if (page?.isClosed() || isTargetClosedError(error)) {
      throw new BossBrowserClosedError();
    }
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    stopBrowserProcess(browserProcess);
  }
}
