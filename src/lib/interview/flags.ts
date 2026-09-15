/**
 * 一场面试的开关（会话的 flagsJson）：实验层总开关 lab（评论员、在线评委与估计器；默认关，只写事件与 trace）、
 * 策略变体（灰度分到的）、影子变体。null = 全默认。备课完成时按放量配置填变体；模拟器可以先写好，备课不覆盖已写的。
 */

export type SessionFlags = {
  lab: boolean;
  /** 这场面试官用的策略变体 id；没分到按默认变体。 */
  policy: string | null;
  /** 影子变体 id；null 不跑影子。 */
  shadow: string | null;
};

export const DEFAULT_FLAGS: SessionFlags = { lab: false, policy: null, shadow: null };

export function sessionFlags(flagsJson: string | null | undefined): SessionFlags {
  try {
    const parsed = JSON.parse(flagsJson ?? "{}") as Partial<Record<keyof SessionFlags, unknown>>;
    return {
      lab: typeof parsed.lab === "boolean" ? parsed.lab : DEFAULT_FLAGS.lab,
      policy: typeof parsed.policy === "string" ? parsed.policy : null,
      shadow: typeof parsed.shadow === "string" ? parsed.shadow : null,
    };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

/** 只填还没定的项（模拟器先写的不覆盖）；返回要存的 JSON。 */
export function fillFlags(flagsJson: string | null | undefined, defaults: { policy: string; shadow: string | null }): string {
  const current = sessionFlags(flagsJson);
  return JSON.stringify({ ...current, policy: current.policy ?? defaults.policy, shadow: current.shadow ?? defaults.shadow });
}
