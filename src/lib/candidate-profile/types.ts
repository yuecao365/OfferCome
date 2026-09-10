export const PROFILE_DIMENSIONS = [
  "knowledge_accuracy",
  "reasoning_depth",
  "experience_evidence",
  "reflection_growth",
  "communication_clarity",
  "delivery_fluency",
] as const;

export const PROFILE_INSIGHT_KINDS = [
  "strength",
  "weakness",
  "pattern",
  "training_focus",
] as const;

export const PROFILE_SOURCE_TYPES = [
  "real_audio",
  "real_transcript",
  "real_summary",
  "mock_text",
] as const;

export type ProfileDimension = (typeof PROFILE_DIMENSIONS)[number];
export type ProfileInsightKind = (typeof PROFILE_INSIGHT_KINDS)[number];
export type ProfileInsightStatus = "tentative" | "active" | "hidden";
export type ProfileSourceType = (typeof PROFILE_SOURCE_TYPES)[number];
export type ProfileTrend = "up" | "down" | "stable" | "insufficient";
export type ProfileLevelLabel = "待积累" | "基础" | "稳定" | "熟练" | "突出";
export type EvidenceConfidenceLabel = "待积累" | "较低" | "中等" | "较高";

/**
 * 六个维度都有明确的来源：模拟面试由逐段评分的评分表维度映射而来（见
 * `interviewer/brief.ts` 的 PROFILE_DIMENSION_BY_RUBRIC），真实面试由评估器逐题判断，
 * delivery_fluency 只由语音指标代码推导。没有来源的维度不设。
 */
export const PROFILE_DIMENSION_LABELS: Record<ProfileDimension, string> = {
  knowledge_accuracy: "知识准确性",
  reasoning_depth: "分析深度与取舍",
  experience_evidence: "经历证据与结果",
  reflection_growth: "复盘学习与改进",
  communication_clarity: "表达结构与清晰度",
  delivery_fluency: "口语流畅与节奏",
};

export const PROFILE_INSIGHT_KIND_LABELS: Record<ProfileInsightKind, string> = {
  strength: "优势",
  weakness: "短板",
  pattern: "稳定模式",
  training_focus: "训练建议",
};

/** 页面按三组呈现，维度保留为底层观察信号。 */
export const PROFILE_DIMENSION_GROUPS = [
  {
    key: "content",
    label: "内容力",
    description: "知识准确与分析取舍",
    dimensions: ["knowledge_accuracy", "reasoning_depth"],
  },
  {
    key: "evidence",
    label: "证据力",
    description: "经历支撑与复盘改进",
    dimensions: ["experience_evidence", "reflection_growth"],
  },
  {
    key: "delivery",
    label: "表达力",
    description: "结构、清晰度与口语节奏",
    dimensions: ["communication_clarity", "delivery_fluency"],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  description: string;
  dimensions: readonly ProfileDimension[];
}>;

export const PROFILE_SOURCE_LABELS: Record<ProfileSourceType, string> = {
  real_audio: "真实录音转写",
  real_transcript: "真实逐字文本",
  real_summary: "真实面试复盘",
  mock_text: "AI 模拟面试",
};

export function normalizeProfileSourceType(
  value: string,
  interviewKind: string,
): ProfileSourceType {
  if (interviewKind === "mock") return "mock_text";
  if (value === "real_audio" || value === "real_transcript" || value === "real_summary") {
    return value;
  }
  return "real_summary";
}

export function isProfileDimension(value: string): value is ProfileDimension {
  return (PROFILE_DIMENSIONS as readonly string[]).includes(value);
}

/** 库里存的是字符串；不认识的维度（已删除的旧维度）按不存在处理。 */
export function parseProfileDimension(value: string): ProfileDimension | null {
  return isProfileDimension(value) ? value : null;
}

export type CandidateProfileContextInsight = {
  id: string;
  dimension: ProfileDimension;
  kind: ProfileInsightKind;
  title: string;
  statement: string;
  confidence: number;
};

export type CandidateProfileContext = {
  revision: number;
  insights: CandidateProfileContextInsight[];
};

export type ProfileRefreshStatus = {
  status: string;
  phase: string;
  revision: number;
  pending: boolean;
  completedCount: number;
  totalCount: number;
  dueAt: string | null;
  lastRefreshedAt: string | null;
  lastError: string | null;
};

export const PROFILE_STATE_ID = "default";
// v5：模拟面试的观察改由逐段评分推导，维度收敛到六个；升版本触发全量重建。
export const PROFILE_ASSESSMENT_VERSION = "ability-assessment-v5";
export const PROFILE_AGGREGATION_VERSION = "candidate-profile-scoring-v3-real-priority";
export const PROFILE_PROMPT_VERSION = "candidate-profile-v4-coach";
export const PROFILE_DEBOUNCE_MS = 60_000;
export const PROFILE_AGENT_TIMEOUT_MS = 60_000;
