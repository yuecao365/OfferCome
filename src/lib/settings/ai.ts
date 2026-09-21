import { prisma } from "@/lib/db";
import { isTrialMode } from "@/lib/runtime-mode";
import { getTrialAiTaskConfig } from "@/lib/trial/ai-config";

import {
  AI_TASKS,
  DEFAULT_AI_CONFIGS,
  maskApiKey,
  validateAiTaskConfig,
  type AiTask,
  type AiTaskConfig,
  type PublicAiTaskConfig,
} from "@/lib/ai/config";

const LEGACY_OPENAI_KEY_SETTING = "openai_api_key";
const SETTING_KEYS: Record<AiTask, string> = {
  transcription: "ai_transcription_config",
  text: "ai_text_config",
  scoring: "ai_scoring_config",
};

function parseStoredConfig(value: string): AiTaskConfig | null {
  try {
    const parsed = JSON.parse(value) as AiTaskConfig;
    if (!AI_TASKS.includes(parsed.task)) return null;
    const validated = validateAiTaskConfig(parsed, parsed.apiKey, true);
    return validated.ok ? validated.value : null;
  } catch {
    return null;
  }
}

async function getLegacyOpenAiKey(): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: LEGACY_OPENAI_KEY_SETTING },
    select: { value: true },
  });
  return setting?.value.trim() || process.env.OPENAI_API_KEY?.trim() || null;
}

/**
 * 评分模型没单独配时的缺省：文本模型是 OpenAI 就换成默认评分模型；否则借用任何已存的 OpenAI key；
 * 都没有就和文本模型同一个（InterviewBench 显示 DeepSeek 评分压高分，能换就换）。
 */
async function defaultScoringConfig(): Promise<AiTaskConfig> {
  const text = await getAiTaskConfig("text");
  const defaults = DEFAULT_AI_CONFIGS.scoring;
  if (text.provider === defaults.provider) return { ...text, task: "scoring", model: defaults.model, baseURL: null };
  const transcription = await getAiTaskConfig("transcription");
  const openaiKey = (transcription.provider === "openai" ? transcription.apiKey : null) ?? (await getLegacyOpenAiKey());
  if (openaiKey) return { ...defaults, apiKey: openaiKey };
  return { ...text, task: "scoring" };
}

export async function getAiTaskConfig(task: AiTask): Promise<AiTaskConfig> {
  // 体验模式：配置由访客随请求带上（BYO Key），完全不碰数据库——
  // Key 不落任何服务端存储。
  if (isTrialMode()) {
    return getTrialAiTaskConfig(task);
  }

  const setting = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEYS[task] },
    select: { value: true },
  });
  const stored = setting ? parseStoredConfig(setting.value) : null;
  if (stored) return stored;
  if (task === "scoring") return defaultScoringConfig();

  const defaults = DEFAULT_AI_CONFIGS[task];
  return {
    ...defaults,
    model:
      task === "transcription"
        ? process.env.OPENAI_TRANSCRIPTION_MODEL ?? defaults.model
        : process.env.OPENAI_INTERVIEW_MODEL ?? defaults.model,
    apiKey: await getLegacyOpenAiKey(),
  };
}

export function isAiTaskConfigured(config: AiTaskConfig): boolean {
  return !config.requiresApiKey || Boolean(config.apiKey);
}

export function toPublicAiTaskConfig(config: AiTaskConfig): PublicAiTaskConfig {
  const { apiKey, ...publicConfig } = config;
  return {
    ...publicConfig,
    apiKeyConfigured: Boolean(apiKey),
    maskedKey: apiKey ? maskApiKey(apiKey) : null,
  };
}

export async function getPublicAiSettings(): Promise<Record<AiTask, PublicAiTaskConfig>> {
  const [transcription, text, scoring] = await Promise.all([
    getAiTaskConfig("transcription"),
    getAiTaskConfig("text"),
    getAiTaskConfig("scoring"),
  ]);
  return {
    transcription: toPublicAiTaskConfig(transcription),
    text: toPublicAiTaskConfig(text),
    scoring: toPublicAiTaskConfig(scoring),
  };
}

export async function saveAiTaskConfig(config: AiTaskConfig): Promise<void> {
  const value = JSON.stringify(config);
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEYS[config.task] },
    create: { key: SETTING_KEYS[config.task], value },
    update: { value },
  });
}
