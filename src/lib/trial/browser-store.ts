import { isTrialInterview, type TrialInterview } from "./interview";
import { createStoredDocument } from "./stored-document";

/**
 * 网页版的两类浏览器数据：
 * - AI 连接：默认 localStorage（关掉网页也不用重连），访客可以改成
 *   "只在本次会话保留"，那样落在 sessionStorage、关标签页即清；
 * - 进行中的模拟面试：localStorage——逐题评分已经花掉访客的额度，
 *   关掉网页再回来必须还能接着交卷。
 * （工作台数据在 workspace-store.ts，同样用 localStorage 跨访问保留。）
 *
 * 连接串里含访客自己的 API Key，所以"记不记得住"必须由访客自己决定：
 * 共用电脑上应当关掉。默认记住是因为每次访问都重填 Key 太劝退。
 */

const AI_TOKEN_KEY = "offerlai.trial.ai";
const AI_REMEMBER_KEY = "offerlai.trial.ai.remember";

function safeStorage(pick: (scope: Window) => Storage): Storage | null {
  try {
    return typeof window === "undefined" ? null : pick(window);
  } catch {
    // 隐私模式、禁用站点数据等场景下访问 Storage 本身会抛。
    return null;
  }
}

const rememberFlag = createStoredDocument<boolean>({
  key: AI_REMEMBER_KEY,
  storage: () => window.localStorage,
  parse: (value) => (typeof value === "boolean" ? value : null),
});

/** 是否跨会话记住连接；未设置过时默认记住。 */
export function rememberAiConnection(): boolean {
  return rememberFlag.read() ?? true;
}

/**
 * 取当前该用哪个存储：已经存了连接的那一处优先，
 * 这样切换偏好时不会把已有连接读丢（搬家由 setRememberAiConnection 负责）。
 */
function aiStorage(): Storage {
  const local = safeStorage((w) => w.localStorage);
  const session = safeStorage((w) => w.sessionStorage);
  if (local && local.getItem(AI_TOKEN_KEY) !== null) return local;
  if (session && session.getItem(AI_TOKEN_KEY) !== null) return session;
  const preferred = rememberAiConnection() ? local : session;
  if (preferred) return preferred;
  // 两个存储都不可用：给一个不落地的替身，页面照常可用（刷新即丢）。
  return memoryStorage;
}

const memoryStorage: Storage = (() => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  } satisfies Storage;
})();

const aiToken = createStoredDocument<string>({
  key: AI_TOKEN_KEY,
  storage: aiStorage,
  parse: (value) => (typeof value === "string" && value ? value : null),
});

const interview = createStoredDocument<TrialInterview>({
  key: "offerlai.trial.interview",
  storage: () => window.localStorage,
  // 版本不匹配一律丢弃重来：体验数据是一次性的，不值得写迁移。
  parse: (value) => (isTrialInterview(value) ? value : null),
});

/** 切换"记住连接"，并把已有连接搬到对应存储，避免两处各留一份。 */
export function setRememberAiConnection(remember: boolean): void {
  const token = aiToken.read();
  const local = safeStorage((w) => w.localStorage);
  const session = safeStorage((w) => w.sessionStorage);

  rememberFlag.write(remember);
  try {
    local?.removeItem(AI_TOKEN_KEY);
    session?.removeItem(AI_TOKEN_KEY);
    if (token) {
      (remember ? local : session)?.setItem(AI_TOKEN_KEY, JSON.stringify(token));
    }
  } catch {
    // 存不进去也要能继续用。
  }
  aiToken.sync();
}

export function readAiToken(): string | null {
  return aiToken.read();
}

export function writeAiToken(token: string | null): void {
  if (token === null) {
    // 断开连接要两处都清干净，避免偏好切换后旧串复活。
    try {
      safeStorage((w) => w.localStorage)?.removeItem(AI_TOKEN_KEY);
      safeStorage((w) => w.sessionStorage)?.removeItem(AI_TOKEN_KEY);
    } catch {
      // 同上。
    }
    aiToken.sync();
    return;
  }
  aiToken.write(token);
}

export function writeInterview(value: TrialInterview | null): void {
  interview.write(value);
}

/** React 绑定用的文档实例（配合 useStoredDocument）。 */
export const trialInterviewDocument = interview;
export const trialAiTokenDocument = aiToken;
/** 未设置过时读到 null，调用方按"默认记住"处理。 */
export const trialRememberDocument = rememberFlag;
