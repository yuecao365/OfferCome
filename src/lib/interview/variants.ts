/**
 * 面试官策略的变体与放量（interview-system-design.md §6.6）：变体只在流程段末尾追加规则，系统提示词其余不变；
 * 放量配置决定新会话拿哪个变体（灰度）、要不要并行跑一个影子变体。同一场永远同一变体（按会话 id 分桶）。
 */

export type PolicyVariant = {
  id: string;
  label: string;
  promptVersion: string;
  /** 追加到流程段末尾的规则；空数组就是现状。 */
  extraRules: string[];
};

export const POLICY_VARIANTS: Record<string, PolicyVariant> = {
  v2: { id: "v2", label: "现状", promptVersion: "policy-v2", extraRules: [] },
  "v2-terse": {
    id: "v2-terse",
    label: "短问句",
    promptVersion: "policy-v2-terse",
    extraRules: ["问句不超过 60 字：先一句承接，再一个问号；要点多的留到下一轮，不并列。"],
  },
};

export const DEFAULT_VARIANT_ID = "v2";

export function policyVariant(id: string | null | undefined): PolicyVariant {
  return (id && POLICY_VARIANTS[id]) || POLICY_VARIANTS[DEFAULT_VARIANT_ID];
}

export type Rollout = {
  live: string;
  canary: { variant: string; percent: number } | null;
  shadow: string | null;
};

export const DEFAULT_ROLLOUT: Rollout = { live: DEFAULT_VARIANT_ID, canary: null, shadow: null };

/** 放量配置：环境变量 INTERVIEW_ROLLOUT 的 JSON；不认识的变体按默认，坏 JSON 按默认。 */
export function rolloutConfig(raw: string | undefined = process.env.INTERVIEW_ROLLOUT): Rollout {
  try {
    const parsed = JSON.parse(raw ?? "{}") as { live?: unknown; canary?: { variant?: unknown; percent?: unknown } | null; shadow?: unknown };
    const known = (value: unknown): string | null => (typeof value === "string" && POLICY_VARIANTS[value] ? value : null);
    const canaryVariant = parsed.canary ? known(parsed.canary.variant) : null;
    const percent = parsed.canary && typeof parsed.canary.percent === "number" ? Math.min(100, Math.max(0, parsed.canary.percent)) : 0;
    return {
      live: known(parsed.live) ?? DEFAULT_ROLLOUT.live,
      canary: canaryVariant && percent > 0 ? { variant: canaryVariant, percent } : null,
      shadow: known(parsed.shadow),
    };
  } catch {
    return { ...DEFAULT_ROLLOUT };
  }
}

/** 会话 id → 0–99 的桶（确定的）。 */
export function bucketOf(sessionId: string): number {
  let hash = 2166136261;
  for (const char of sessionId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % 100;
}

/** 新会话拿哪个变体：桶落在灰度百分比内拿 canary，其余拿 live。 */
export function assignVariant(rollout: Rollout, sessionId: string): string {
  if (rollout.canary && bucketOf(sessionId) < rollout.canary.percent) return rollout.canary.variant;
  return rollout.live;
}
