export const AI_TASKS = ["transcription", "text"] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const AI_PROVIDERS = [
  "openai",
  "anthropic",
  "qwen",
  "kimi",
  "deepseek",
  "glm",
  "minimax",
  "bytedance",
  "compatible",
  "local",
] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type AiTaskConfig = {
  task: AiTask;
  provider: AiProvider;
  model: string;
  baseURL: string | null;
  apiKey: string | null;
  requiresApiKey: boolean;
};

export type PublicAiTaskConfig = Omit<AiTaskConfig, "apiKey"> & {
  apiKeyConfigured: boolean;
  maskedKey: string | null;
};

export type AiTaskConfigInput = {
  task?: unknown;
  provider?: unknown;
  model?: unknown;
  baseURL?: unknown;
  apiKey?: unknown;
  requiresApiKey?: unknown;
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  qwen: "Qwen（通义千问）",
  kimi: "Kimi",
  deepseek: "DeepSeek",
  glm: "GLM（智谱）",
  minimax: "MiniMax",
  bytedance: "ByteDance（火山引擎）",
  compatible: "自定义 OpenAI-compatible",
  local: "本地模型服务",
};

export const TASK_PROVIDERS: Record<AiTask, readonly AiProvider[]> = {
  transcription: ["openai", "qwen", "bytedance", "compatible", "local"],
  text: [
    "openai",
    "anthropic",
    "qwen",
    "kimi",
    "deepseek",
    "glm",
    "minimax",
    "bytedance",
    "compatible",
    "local",
  ],
};

const PROVIDER_BASE_URLS: Record<
  AiTask,
  Partial<Record<AiProvider, string>>
> = {
  transcription: {
    qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    bytedance: "https://openspeech.bytedance.com/api/v3/auc/bigmodel",
  },
  text: {
    anthropic: "https://api.anthropic.com/v1",
    qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    kimi: "https://api.moonshot.cn/v1",
    deepseek: "https://api.deepseek.com",
    glm: "https://open.bigmodel.cn/api/paas/v4",
    minimax: "https://api.minimaxi.com/v1",
    bytedance: "https://ark.cn-beijing.volces.com/api/v3",
  },
};

export function getDefaultBaseURL(
  task: AiTask,
  provider: AiProvider,
): string | null {
  return PROVIDER_BASE_URLS[task][provider] ?? null;
}

export function isCustomProvider(provider: AiProvider): boolean {
  return provider === "compatible" || provider === "local";
}

export const DEFAULT_AI_CONFIGS: Record<AiTask, Omit<AiTaskConfig, "apiKey">> = {
  transcription: {
    task: "transcription",
    provider: "openai",
    model: "gpt-4o-mini-transcribe",
    baseURL: null,
    requiresApiKey: true,
  },
  text: {
    task: "text",
    provider: "openai",
    model: "gpt-4.1-mini",
    baseURL: null,
    requiresApiKey: true,
  },
};

export const MODEL_OPTIONS: Record<
  AiTask,
  Partial<Record<AiProvider, readonly string[]>>
> = {
  transcription: {
    openai: ["gpt-transcribe", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"],
    qwen: [
      "qwen3-asr-flash",
      "qwen3-asr-flash-2026-02-10",
      "qwen3-asr-flash-2025-09-08",
    ],
    bytedance: [
      "volc.seedasr.auc",
      "volc.bigasr.auc",
      "volc.bigasr.auc_turbo",
    ],
  },
  text: {
    openai: [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5.2",
      "gpt-4.1-mini",
    ],
    anthropic: [
      "claude-fable-5",
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "claude-haiku-4-5",
    ],
    qwen: [
      "qwen3.5-plus",
      "qwen3.5-flash",
      "qwen3.5-397b-a17b",
      "qwen3.5-122b-a10b",
      "qwen3.5-35b-a3b",
      "qwen3.5-27b",
      "qwen3-max",
      "qwen3-32b",
    ],
    kimi: [
      "kimi-k3",
      "kimi-k2.7-code",
      "kimi-k2.7-code-highspeed",
      "kimi-k2.6",
      "kimi-k2.5",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
    ],
    deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
    glm: [
      "glm-5.2",
      "glm-5.1",
      "glm-5-turbo",
      "glm-5",
      "glm-4.7",
      "glm-4.7-flashx",
      "glm-4.6",
      "glm-4.5-air",
    ],
    minimax: [
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.1",
      "MiniMax-M2.1-highspeed",
      "MiniMax-M2",
      "M2-her",
    ],
    bytedance: [
      "doubao-seed-2-1-pro",
      "doubao-seed-2-1-turbo",
      "doubao-seed-evolving",
      "doubao-seed-2-0-pro-260215",
      "doubao-seed-2-0-lite-260215",
      "doubao-seed-2-0-mini-260215",
      "doubao-seed-2-0-code",
      "doubao-seed-character",
    ],
  },
};

const TRANSCRIPTION_ONLY_MODEL_PATTERN =
  /(?:whisper|transcrib|(?:^|[-_.])asr(?:[-_.]|$)|(?:^|[-_.])auc(?:[-_.]|$))/i;

function normalizedURL(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().replace(/\/+$/, "");
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "••••••••";
  const prefix = trimmed.startsWith("sk-") ? "sk-" : "";
  return `${prefix}••••${trimmed.slice(-4)}`;
}

export function validateAiTaskConfig(
  input: AiTaskConfigInput,
  existingApiKey: string | null,
  hasApiKeyField: boolean,
): { ok: true; value: AiTaskConfig } | { ok: false; message: string } {
  if (!AI_TASKS.includes(input.task as AiTask)) {
    return { ok: false, message: "未知的 AI 任务类型。" };
  }
  if (!AI_PROVIDERS.includes(input.provider as AiProvider)) {
    return { ok: false, message: "请选择支持的模型服务商。" };
  }

  const task = input.task as AiTask;
  const provider = input.provider as AiProvider;
  if (!TASK_PROVIDERS[task].includes(provider)) {
    return {
      ok: false,
      message: `${PROVIDER_LABELS[provider]} 不支持当前 AI 任务。`,
    };
  }

  const model = typeof input.model === "string" ? input.model.trim() : "";
  const requestedBaseURL = normalizedURL(input.baseURL);
  const defaultBaseURL = getDefaultBaseURL(task, provider);
  const requiresApiKey =
    provider === "local"
      ? false
      : provider === "compatible"
        ? input.requiresApiKey !== false
        : true;
  const apiKey = hasApiKeyField
    ? typeof input.apiKey === "string"
      ? input.apiKey.trim() || null
      : null
    : existingApiKey;

  if (!model || model.length > 160 || /\s/.test(model)) {
    return {
      ok: false,
      message: "请输入有效的模型名称，模型名称不能包含空格。",
    };
  }

  const knownTextModels = MODEL_OPTIONS.text[provider] ?? [];
  if (task === "transcription" && knownTextModels.includes(model)) {
    return { ok: false, message: `模型 ${model} 不支持语音转文本任务。` };
  }
  if (task === "text" && TRANSCRIPTION_ONLY_MODEL_PATTERN.test(model)) {
    return { ok: false, message: `模型 ${model} 不支持文本理解任务。` };
  }

  if (provider === "openai" && apiKey && !apiKey.startsWith("sk-")) {
    return {
      ok: false,
      message: "OpenAI API Key 通常以 sk- 开头，请检查 Key 与服务商是否匹配。",
    };
  }
  if (requiresApiKey && !apiKey) {
    return {
      ok: false,
      message: `${PROVIDER_LABELS[provider]} 需要配置 API Key。`,
    };
  }

  const baseURL = defaultBaseURL ?? requestedBaseURL;
  if (isCustomProvider(provider) && !baseURL) {
    return {
      ok: false,
      message: `${PROVIDER_LABELS[provider]} 需要配置服务地址。`,
    };
  }
  if (baseURL) {
    try {
      const url = new URL(baseURL);
      if (!(url.protocol === "http:" || url.protocol === "https:")) {
        throw new Error();
      }
    } catch {
      return { ok: false, message: "服务地址必须是有效的 HTTP 或 HTTPS URL。" };
    }
  }

  return {
    ok: true,
    value: {
      task,
      provider,
      model,
      baseURL,
      apiKey,
      requiresApiKey,
    },
  };
}
