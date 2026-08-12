import { prisma } from "@/lib/db";

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

export async function getAiTaskConfig(task: AiTask): Promise<AiTaskConfig> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEYS[task] },
    select: { value: true },
  });
  const stored = setting ? parseStoredConfig(setting.value) : null;
  if (stored) return stored;

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
  const [transcription, text] = await Promise.all([
    getAiTaskConfig("transcription"),
    getAiTaskConfig("text"),
  ]);
  return {
    transcription: toPublicAiTaskConfig(transcription),
    text: toPublicAiTaskConfig(text),
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
