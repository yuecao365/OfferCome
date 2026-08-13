import { prisma } from "@/lib/db";

const WEB_SEARCH_SETTING_KEY = "web_search_config";

export type WebSearchConfig = {
  provider: "tavily" | "none";
  apiKey: string | null;
};

export type PublicWebSearchConfig = {
  provider: WebSearchConfig["provider"];
  apiKeyConfigured: boolean;
  maskedKey: string | null;
};

function maskKey(value: string): string {
  return value.length <= 8 ? "••••••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function getWebSearchConfig(): Promise<WebSearchConfig> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: WEB_SEARCH_SETTING_KEY },
    select: { value: true },
  });
  if (!setting) return { provider: "none", apiKey: null };
  try {
    const parsed = JSON.parse(setting.value) as Partial<WebSearchConfig>;
    return parsed.provider === "tavily" && typeof parsed.apiKey === "string"
      ? { provider: "tavily", apiKey: parsed.apiKey.trim() || null }
      : { provider: "none", apiKey: null };
  } catch {
    return { provider: "none", apiKey: null };
  }
}

export function toPublicWebSearchConfig(
  config: WebSearchConfig,
): PublicWebSearchConfig {
  return {
    provider: config.provider,
    apiKeyConfigured: Boolean(config.apiKey),
    maskedKey: config.apiKey ? maskKey(config.apiKey) : null,
  };
}

export async function saveWebSearchConfig(config: WebSearchConfig): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: WEB_SEARCH_SETTING_KEY },
    create: { key: WEB_SEARCH_SETTING_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  });
}
