import { isTrialInterview, type TrialInterview } from "./interview";

/**
 * 体验版的浏览器端存储。
 *
 * 一律用 sessionStorage 而不是 localStorage：关掉标签页数据就没了，
 * 这既符合"一次性体验"的产品承诺，也让访客的 AI Key 停留时间最短。
 * 刷新页面仍然保留，所以面试中途误刷不会丢进度。
 *
 * 读写都包了 try/catch——隐私模式、禁用站点数据、iframe 等场景下
 * sessionStorage 的访问本身就会抛错，不能让它打断页面渲染。
 */

const AI_TOKEN_KEY = "offerlai.trial.ai";
const INTERVIEW_KEY = "offerlai.trial.interview";

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // 存不进去也要能继续用，只是刷新后会丢。
  }
}

/**
 * 访客模型配置的编码串。它由服务端校验并实测连通后签发，
 * 前端只负责保管和随请求带上，不解析内容。
 */
export function readAiToken(): string | null {
  return read(AI_TOKEN_KEY);
}

export function writeAiToken(token: string | null): void {
  write(AI_TOKEN_KEY, token);
  notify();
}

function parseInterview(raw: string | null): TrialInterview | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // 版本不匹配直接丢弃：体验数据是一次性的，不值得为它写迁移。
    return isTrialInterview(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeInterview(interview: TrialInterview | null): void {
  write(INTERVIEW_KEY, interview ? JSON.stringify(interview) : null);
  notify();
}

export function clearTrialData(): void {
  write(AI_TOKEN_KEY, null);
  write(INTERVIEW_KEY, null);
  notify();
}

/**
 * useSyncExternalStore 的订阅端。sessionStorage 是外部存储，React 感知不到
 * 它的变化——组件读取它必须走这个通道，而不是在 effect 里 setState。
 */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeTrialStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 快照必须是稳定引用，否则 useSyncExternalStore 会无限重渲染。
 * 用原始字符串做缓存键：内容没变就返回上次解析出的对象。
 */
let interviewCache: { raw: string | null; value: TrialInterview | null } = {
  raw: null,
  value: null,
};

export function getInterviewSnapshot(): TrialInterview | null {
  const raw = read(INTERVIEW_KEY);
  if (raw !== interviewCache.raw) {
    interviewCache = { raw, value: parseInterview(raw) };
  }
  return interviewCache.value;
}

export function getAiReadySnapshot(): boolean {
  return read(AI_TOKEN_KEY) !== null;
}

/** 服务端渲染时没有 sessionStorage，一律当作"还没有数据"。 */
export function getServerSnapshot(): null {
  return null;
}

export function getAiReadyServerSnapshot(): boolean {
  return false;
}
