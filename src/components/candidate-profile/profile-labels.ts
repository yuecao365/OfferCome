import type { EvidenceConfidenceLabel, ProfileLevelLabel } from "@/lib/candidate-profile/types";
import { defineMessages, type Locale } from "@/lib/i18n/locale";

/**
 * 能力画像里按语言换的标签：等级、证据量、趋势、维度分组。
 * 等级与证据量在库里存的是中文值（ProfileLevelLabel / EvidenceConfidenceLabel），
 * 所以英文表以这些存储值为键，显示时再换；未知值原样返回。
 */
const LEVEL_LABELS_EN: Record<ProfileLevelLabel, string> = {
  待积累: "Not enough data",
  基础: "Basic",
  稳定: "Steady",
  熟练: "Proficient",
  突出: "Outstanding",
};

const CONFIDENCE_LABELS_EN: Record<EvidenceConfidenceLabel, string> = {
  待积累: "not enough yet",
  较低: "limited",
  中等: "moderate",
  较高: "strong",
};

export function profileLevelLabel(value: string, locale: Locale): string {
  if (locale !== "en") return value;
  return LEVEL_LABELS_EN[value as ProfileLevelLabel] ?? value;
}

export function evidenceConfidenceLabel(value: string, locale: Locale): string {
  if (locale !== "en") return value;
  return CONFIDENCE_LABELS_EN[value as EvidenceConfidenceLabel] ?? value;
}

export const profileLabelMessages = defineMessages({
  "zh-CN": {
    /** 洞察详情里的趋势 */
    trend: { up: "上升", down: "下降", stable: "稳定", insufficient: "趋势待积累" } as Record<string, string>,
    /** 等级的空值 */
    pending: "待积累",
  },
  en: {
    trend: { up: "Rising", down: "Falling", stable: "Steady", insufficient: "Not enough data for a trend" },
    pending: "Not enough data",
  },
});
