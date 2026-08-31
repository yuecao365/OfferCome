import { isTrialInterview, type TrialInterview } from "./interview";
import { createStoredDocument } from "./stored-document";

/**
 * 体验版的两类浏览器数据，存储位置刻意不同：
 * - AI Key：sessionStorage——关标签页即消失，让密钥的停留时间最短；
 * - 进行中的模拟面试：sessionStorage——一次性体验，误刷新不丢、关页即弃。
 * （工作台数据在 workspace-store.ts，用 localStorage 跨访问保留。）
 */

const aiToken = createStoredDocument<string>({
  key: "offerlai.trial.ai",
  storage: () => window.sessionStorage,
  parse: (value) => (typeof value === "string" && value ? value : null),
});

const interview = createStoredDocument<TrialInterview>({
  key: "offerlai.trial.interview",
  storage: () => window.sessionStorage,
  // 版本不匹配一律丢弃重来：体验数据是一次性的，不值得写迁移。
  parse: (value) => (isTrialInterview(value) ? value : null),
});

export function readAiToken(): string | null {
  return aiToken.read();
}

export function writeAiToken(token: string | null): void {
  aiToken.write(token);
}

export function writeInterview(value: TrialInterview | null): void {
  interview.write(value);
}

export function clearTrialData(): void {
  aiToken.write(null);
  interview.write(null);
}

/** React 绑定用的文档实例（配合 useStoredDocument）。 */
export const trialInterviewDocument = interview;
export const trialAiTokenDocument = aiToken;
