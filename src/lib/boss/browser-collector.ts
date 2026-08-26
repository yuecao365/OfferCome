import { mkdir } from "node:fs/promises";

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
  launchBrowserProcess,
  stopBrowserProcess,
} from "./browser-launch";
import {
  CdpClient,
  closeBrowserGracefully,
  ensureBossBrowserClosed,
  getBossCdpPort,
  isBrowserAlive,
  listPageTargets,
  waitForBrowserAlive,
} from "./cdp";
import {
  normalizeBossContacts,
  type BossContactCandidate,
  type NormalizedBossContact,
} from "./parse";
import { getBossLocalPaths } from "./paths";
import type { BossSyncStopReason } from "./sync-policy";

const BOSS_RECOMMEND_URL = "https://www.zhipin.com/web/geek/recommend";
const BOSS_BROWSER_BOOTSTRAP_URL = "about:blank";
const BOSS_JOB_RESPONSE_PATH = "/wapi/zprelation/interaction/geekGetJob";
// 推荐页顶部「沟通过」标签页对应 tag=5；tag=2 是右侧「谁看过我」，
// 那些岗位并非本人沟通过的，不能混进投递记录。
const BOSS_COMMUNICATED_TAG = "5";
const NEXT_PAGE_SELECTOR = ".options-pages a:last-child";
const RESPONSE_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SETTLE_MS = 1_200;
const POLL_INTERVAL_MS = 300;

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

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isBossLoginUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return (
    parsed !== null &&
    /(?:^|\.)zhipin\.com$/i.test(parsed.hostname) &&
    /^\/web\/user(?:\/|$)/i.test(parsed.pathname)
  );
}

/** 只认「沟通过」列表的岗位接口响应。 */
function isCommunicatedJobUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return (
    parsed !== null &&
    parsed.pathname === BOSS_JOB_RESPONSE_PATH &&
    parsed.searchParams.get("tag") === BOSS_COMMUNICATED_TAG
  );
}

function isDisabledControl(attributes: Record<string, string>): boolean {
  return (
    attributes.disabled !== undefined ||
    attributes["aria-disabled"] === "true" ||
    /(?:^|\s)(?:disabled|is-disabled)(?:\s|$)/i.test(attributes.class ?? "")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 把 Boss 的原话带进错误文案——只报 code 的话，下次排查还得靠猜。 */
export function describeBossAccessIssue(issue: BossAccessIssue): string {
  const parts = [
    issue.code === null ? null : `code=${issue.code}`,
    issue.message || null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `（${parts.join("：")}）` : "";
}

/**
 * 判断当前会话还能不能继续采集，不能则抛出对应的错误。
 *
 * 三级判定的顺序是有意的：
 * 1. 停在登录页是确凿证据，比接口 code 可靠，所以先看 URL；
 * 2. 已知的登录 code / 关键词次之；
 * 3. 最后把「不认识的错误码 + 一条岗位数据都没拿到」也判成需要重新登录。
 *
 * 第 3 条是关键取舍：这种组合压倒性地是登录或安全校验问题，而 code 白名单
 * 永远追不上 Boss 的变化。猜错只是让用户多扫一次码（可恢复），猜对则把
 * 「请稍后重试」这个死胡同变成前端已有的一键重新登录流程。
 */
export function assertBossSessionUsable(input: {
  /** 当前页面地址，取不到时传 null。 */
  currentUrl: string | null;
  /** 最近一次响应携带的异常，正常时为 null。 */
  issue: BossAccessIssue | null;
  /** 本次已经成功解析到的岗位响应数。 */
  collectedResponses: number;
  /** 首屏判定还是翻页途中判定，只影响文案。 */
  duringSync: boolean;
}): void {
  if (input.currentUrl !== null && isBossLoginUrl(input.currentUrl)) {
    throw new BossBrowserLoginRequiredError(
      input.duringSync
        ? "Boss 在同步过程中跳回了登录页，请重新登录后再同步。"
        : "Boss 当前未登录，请在登录窗口中完成登录。",
    );
  }

  const { issue } = input;
  if (!issue) return;

  if (isBossLoginRequiredResponse(issue.code, issue.message)) {
    throw new BossBrowserLoginRequiredError(
      input.duringSync
        ? "Boss 在同步过程中要求重新登录或安全校验，已停止继续读取。"
        : "Boss 要求登录或安全校验，请先完成登录后再同步。",
    );
  }

  if (input.collectedResponses === 0) {
    throw new BossBrowserLoginRequiredError(
      `Boss 没有返回任何岗位数据${describeBossAccessIssue(issue)}。登录状态很可能已经失效，请重新登录后再同步。`,
    );
  }

  throw new Error(
    `Boss 页面返回异常响应${describeBossAccessIssue(issue)}，已停止同步。`,
  );
}

async function getPageUrl(port: number, targetId: string): Promise<string | null> {
  try {
    const targets = await listPageTargets(port);
    return targets.find((target) => target.id === targetId)?.url ?? null;
  } catch {
    return null;
  }
}

export type BossAccessIssue = { code: number | null; message: string };

type CollectorState = {
  candidates: BossContactCandidate[];
  hasMore: boolean | null;
  responseCount: number;
  accessIssue: BossAccessIssue | null;
  bodyTasks: Set<Promise<void>>;
};

function handleJobPayload(state: CollectorState, payload: unknown): void {
  const code = getBossApiCode(payload);
  const message = getBossApiMessage(payload);
  // 没有顶层数字 code 的载荷（如 {message:"ok", zpData:{...}}）视为成功，
  // 只有明确的非 0 code 才算异常，否则正常数据会被整批丢弃并误报未登录。
  if (code !== null && code !== 0) {
    state.accessIssue = { code, message };
    return;
  }

  state.accessIssue = null;
  state.responseCount += 1;
  state.candidates.push(...extractBossContactCandidatesFromApiPayload(payload));
  state.hasMore = getBossHasMore(payload);
}

/** 订阅「沟通过」列表的岗位响应。 */
function watchJobResponses(client: CdpClient, state: CollectorState): void {
  const urlById = new Map<string, string>();

  client.on("Network.responseReceived", (params) => {
    const event = params as { requestId?: string; response?: { url?: string } };
    const url = event.response?.url ?? "";
    if (event.requestId && isCommunicatedJobUrl(url)) {
      urlById.set(event.requestId, url);
    }
  });
  client.on("Network.loadingFailed", (params) => {
    const { requestId } = params as { requestId?: string };
    if (requestId) urlById.delete(requestId);
  });
  client.on("Network.loadingFinished", (params) => {
    const { requestId } = params as { requestId?: string };
    if (!requestId || !urlById.delete(requestId)) return;

    // 响应体要等 loadingFinished 之后取，太早会拿到空内容。
    const task: Promise<void> = client
      .send("Network.getResponseBody", { requestId })
      .then((result) => {
        const { body, base64Encoded } = result as {
          body?: string;
          base64Encoded?: boolean;
        };
        const text = base64Encoded
          ? Buffer.from(body ?? "", "base64").toString("utf8")
          : (body ?? "");
        handleJobPayload(state, JSON.parse(text) as unknown);
      })
      .catch(() => undefined)
      .finally(() => state.bodyTasks.delete(task));
    state.bodyTasks.add(task);
  });
}

/** 等岗位响应数量增加，返回是否等到。 */
async function waitForNextResponse(
  state: CollectorState,
  previousCount: number,
  isClosed: () => boolean,
): Promise<boolean> {
  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (state.responseCount > previousCount) return true;
    if (isClosed()) throw new BossBrowserClosedError();
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function settleBodies(state: CollectorState): Promise<void> {
  while (state.bodyTasks.size > 0) {
    await Promise.all([...state.bodyTasks]);
  }
}

/** 点击列表底部的「下一页」。返回 false 表示已经到最后一页。 */
async function goToNextPage(client: CdpClient): Promise<boolean> {
  const nodeId = await client.querySelector(NEXT_PAGE_SELECTOR);
  if (!nodeId) return false;
  if (isDisabledControl(await client.getAttributes(nodeId))) return false;
  return client.clickElement(nodeId);
}

export async function collectBossContactsFromBrowser(
  options: CollectBossContactsOptions,
): Promise<BossBrowserCollectionResult> {
  const paths = getBossLocalPaths(options.cwd);
  await mkdir(paths.browserProfileDir, { recursive: true });

  const browserPath = await findBrowserExecutable();
  if (!browserPath) {
    throw new Error("未找到 Chrome 或 Edge，无法启动 Boss 浏览器同步。");
  }

  const port = getBossCdpPort();
  await ensureBossBrowserClosed(port);
  const browserProcess = launchBrowserProcess(
    browserPath,
    buildBrowserLaunchArgs({
      userDataDir: paths.browserProfileDir,
      remoteDebuggingPort: port,
      url: BOSS_BROWSER_BOOTSTRAP_URL,
      offScreen: true,
    }),
  );

  let client: CdpClient | null = null;
  let browserGone = false;
  const isClosed = () => browserGone;

  try {
    await waitForBrowserAlive(port, 20_000, "Boss 同步浏览器启动失败。");
    const target = (await listPageTargets(port)).find(
      (candidate) => candidate.webSocketDebuggerUrl,
    );
    if (!target?.webSocketDebuggerUrl) {
      throw new Error("Boss 同步浏览器没有可用页面。");
    }

    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    client.onClose = () => {
      browserGone = true;
    };

    const state: CollectorState = {
      candidates: [],
      hasMore: null,
      responseCount: 0,
      accessIssue: null,
      bodyTasks: new Set(),
    };
    watchJobResponses(client, state);

    await client.send("Network.enable");
    await client.send("DOM.enable");
    options.onMessage?.("正在后台读取 Boss 沟通过的岗位。");
    await client.send("Page.navigate", { url: BOSS_RECOMMEND_URL });

    // 等首页岗位数据；跳到登录页或超时都视为未登录。
    const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
    while (Date.now() < deadline && state.responseCount === 0 && !browserGone) {
      // Boss 已经明确回了错（登录失效、安全校验等）就不必再等满超时，
      // 立刻交给下面的会话体检给出可操作的提示。
      if (state.accessIssue) break;
      const url = await getPageUrl(port, target.id);
      if (url !== null && isBossLoginUrl(url)) break;
      await sleep(POLL_INTERVAL_MS);
    }
    await settleBodies(state);
    if (browserGone || !(await isBrowserAlive(port))) {
      throw new BossBrowserClosedError();
    }

    // 首屏就是登录态的体检：有异常响应、或压根没等到数据时才深查，
    // 一切正常的情况下不多花一次 CDP 往返。
    if (state.accessIssue || state.responseCount === 0) {
      assertBossSessionUsable({
        currentUrl: await getPageUrl(port, target.id),
        issue: state.accessIssue,
        collectedResponses: state.responseCount,
        duringSync: false,
      });
      // 没抛错说明既没跳登录页也没有异常响应，那就是纯粹没等到。
      throw new Error(
        "等待 Boss 岗位数据超时，没有收到岗位列表响应。请检查网络后重新同步。",
      );
    }

    const diagnostics: BossBrowserPageDiagnostics[] = [];
    let stopReason: BossSyncStopReason | null = null;
    let knownCount = normalizeBossContacts(state.candidates).length;
    diagnostics.push({
      page: 1,
      url: BOSS_RECOMMEND_URL,
      candidateCount: knownCount,
      collectionSource: "browser",
    });
    for (let pageNumber = 2; pageNumber <= options.maxPages; pageNumber += 1) {
      if (state.hasMore === false) {
        stopReason = "no-more-pages";
        break;
      }

      const previousCount = state.responseCount;
      if (!(await goToNextPage(client))) {
        stopReason = "no-more-pages";
        break;
      }
      if (!(await waitForNextResponse(state, previousCount, isClosed))) {
        // 点击成功但响应超时不等于到了末页：必须如实上报截断，
        // 否则丢页会被当成“已全部同步”。
        stopReason = "response-timeout";
        break;
      }

      await sleep(options.pageSettleMs ?? DEFAULT_PAGE_SETTLE_MS);
      await settleBodies(state);
      if (browserGone) throw new BossBrowserClosedError();

      const url = await getPageUrl(port, target.id);
      assertBossSessionUsable({
        currentUrl: url,
        issue: state.accessIssue,
        collectedResponses: knownCount,
        duringSync: true,
      });

      const nextCount = normalizeBossContacts(state.candidates).length;
      diagnostics.push({
        page: pageNumber,
        url: url ?? BOSS_RECOMMEND_URL,
        candidateCount: Math.max(0, nextCount - knownCount),
        collectionSource: "browser",
      });
      knownCount = nextCount;

      if (pageNumber >= options.maxPages) {
        stopReason = "max-pages";
      }
    }

    // maxPages<=1 时翻页循环不会执行，此处兜底，避免 null 被当成“已到末页”。
    stopReason ??= state.hasMore === false ? "no-more-pages" : "max-pages";

    return {
      contacts: normalizeBossContacts(state.candidates),
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
    if (client && (browserGone || !(await isBrowserAlive(port)))) {
      throw new BossBrowserClosedError();
    }
    throw error;
  } finally {
    client?.close();
    // 优雅关闭失败时必须兜底杀进程：离屏窗口用户看不见也无法手动关闭，
    // 留下来会挡住之后的每一次同步。
    if (!(await closeBrowserGracefully(port))) {
      stopBrowserProcess(browserProcess);
    }
  }
}
