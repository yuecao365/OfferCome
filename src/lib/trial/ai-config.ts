import { AsyncLocalStorage } from "node:async_hooks";

import {
  DEFAULT_AI_CONFIGS,
  validateAiTaskConfig,
  type AiTask,
  type AiTaskConfig,
} from "@/lib/ai/config";
import { isTrialMode } from "@/lib/runtime-mode";

import { TRIAL_AI_HEADER } from "./protocol";

/**
 * 体验模式的 AI 配置：访客自带 Key。
 *
 * 服务端完全无状态——Key 由浏览器保存，随每个请求的请求头带上，用完即弃，
 * 不落数据库、不落磁盘、不进日志。放在请求头而不是请求体，是因为出错时
 * 请求体更容易被各层代理记录。
 *
 * agent 函数深处会调用 getAiTaskConfig()，用 AsyncLocalStorage 把配置绑到
 * 请求的异步上下文上，就不必逐层透传参数、改动那些函数的签名。
 */

const storage = new AsyncLocalStorage<AiTaskConfig>();

export function encodeTrialAiConfig(config: AiTaskConfig): string {
  return Buffer.from(
    JSON.stringify({
      provider: config.provider,
      model: config.model,
      baseURL: config.baseURL,
      apiKey: config.apiKey,
    }),
    "utf8",
  ).toString("base64url");
}

/** 请求头是客户端可伪造的输入，解码必须走完整校验，不合法一律当没配。 */
export function decodeTrialAiConfig(raw: string | null): AiTaskConfig | null {
  if (!raw) return null;

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

export function readTrialAiConfig(request: Request): AiTaskConfig | null {
  return decodeTrialAiConfig(request.headers.get(TRIAL_AI_HEADER));
}

export function runWithTrialAiConfig<T>(
  config: AiTaskConfig,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(config, fn);
}

/**
 * 体验模式下 getAiTaskConfig 的数据来源。没有绑定配置时返回无 Key 的默认值，
 * 交给 assertAiConfigured 给出统一的引导报错。
 */
export function getTrialAiTaskConfig(task: AiTask): AiTaskConfig {
  if (task === "text" && isTrialMode()) {
    const bound = storage.getStore();
    if (bound) return bound;
  }
  return { ...DEFAULT_AI_CONFIGS[task], apiKey: null };
}
