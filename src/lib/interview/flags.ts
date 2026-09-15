/**
 * 一场面试的开关（会话的 flagsJson）：评论员开 / 关；之后的影子运行、灰度也放这里，不再加列。null = 全默认。
 */

export type SessionFlags = { critic: boolean };

export const DEFAULT_FLAGS: SessionFlags = { critic: true };

export function sessionFlags(flagsJson: string | null | undefined): SessionFlags {
  try {
    const parsed = JSON.parse(flagsJson ?? "{}") as Partial<Record<keyof SessionFlags, unknown>>;
    return { critic: typeof parsed.critic === "boolean" ? parsed.critic : DEFAULT_FLAGS.critic };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}
