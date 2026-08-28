import { AsyncLocalStorage } from "node:async_hooks";

import {
  DEFAULT_AI_CONFIGS,
  validateAiTaskConfig,
  type AiTask,
  type AiTaskConfig,
} from "@/lib/ai/config";
import { isTrialMode } from "@/lib/runtime-mode";

/**
 * 体验模式的会话上下文。
 *
 * 两个原则决定了这里的形态：
 * 1. 访客数据只活在"这次会话"——sessionId 存 httpOnly cookie，由 proxy 发放，
 *    对应一个 TTL 后删除的临时 SQLite 文件；
 * 2. AI Key 是访客自带的，只存在访客浏览器的 httpOnly cookie 里、随请求带上，
 *    服务端不落任何存储。
 *
 * 请求内（页面、路由、Server Action）直接从 cookie 读；after() 后台任务里
 * 请求已经结束，所以调度方在请求内先 captureTrialContext()，回调里用
 * runWithTrialContext() 把上下文重新装进 AsyncLocalStorage。
 */

export const TRIAL_SESSION_COOKIE = "offerlai_trial_sid";
export const TRIAL_AI_COOKIE = "offerlai_trial_ai";
export const TRIAL_SESSION_TTL_MS = 2 * 60 * 60 * 1_000;

export type TrialContext = {
  sessionId: string;
  aiConfig: AiTaskConfig | null;
};

const storage = new AsyncLocalStorage<TrialContext>();

/** proxy 发的是 UUID；校验防止 cookie 被改成路径穿越。 */
const SESSION_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

export function isValidTrialSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}

/** 只挑 Key 相关字段进 cookie，别的（task/requiresApiKey）解码时重新推导。 */
export function encodeTrialAiCookie(config: AiTaskConfig): string {
  const payload = JSON.stringify({
    provider: config.provider,
    model: config.model,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/** cookie 是客户端可伪造的输入，解码必须走完整校验，不合法一律当没配。 */
export function decodeTrialAiCookie(raw: string): AiTaskConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const input = parsed as Record<string, unknown>;
  const validated = validateAiTaskConfig(
    {
      task: "text",
      provider: input.provider,
      model: input.model,
      baseURL: input.baseURL,
      apiKey: input.apiKey,
    },
    typeof input.apiKey === "string" ? input.apiKey : null,
    true,
  );
  return validated.ok ? validated.value : null;
}

async function readRequestCookie(name: string): Promise<string | null> {
  try {
    // 动态导入：让脚本和测试可以在 Next 运行时之外加载本模块。
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get(name)?.value ?? null;
  } catch {
    // 不在请求作用域内（比如脱离请求的后台任务）。
    return null;
  }
}

/** 当前体验上下文：先看 ALS（后台任务），再落回请求 cookie。 */
export async function getTrialContext(): Promise<TrialContext | null> {
  if (!isTrialMode()) return null;

  const bound = storage.getStore();
  if (bound) return bound;

  const sessionId = await readRequestCookie(TRIAL_SESSION_COOKIE);
  if (!sessionId || !isValidTrialSessionId(sessionId)) return null;

  const rawAiConfig = await readRequestCookie(TRIAL_AI_COOKIE);
  return {
    sessionId,
    aiConfig: rawAiConfig ? decodeTrialAiCookie(rawAiConfig) : null,
  };
}

/**
 * 在请求内同步调用，把上下文捕获成 Promise；after() 回调里 await 它。
 * cookies() 的请求绑定发生在调用时刻，所以必须在 after 之外调。
 */
export function captureTrialContext(): Promise<TrialContext | null> {
  if (!isTrialMode()) return Promise.resolve(null);
  return getTrialContext().catch(() => null);
}

export async function runWithTrialContext<T>(
  context: TrialContext | null,
  fn: () => Promise<T>,
): Promise<T> {
  return context ? storage.run(context, fn) : fn();
}

/**
 * 体验模式下的 AI 配置：text 任务用访客 cookie 里的配置；transcription
 * 永远视为未配置（体验版只开放文字作答）。没配时返回无 Key 的默认值，
 * 让 assertAiConfigured 给出统一的引导报错。
 */
export async function getTrialAiTaskConfig(task: AiTask): Promise<AiTaskConfig> {
  if (task === "text") {
    const context = await getTrialContext();
    if (context?.aiConfig) return context.aiConfig;
  }
  return { ...DEFAULT_AI_CONFIGS[task], apiKey: null };
}
