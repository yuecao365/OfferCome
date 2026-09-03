export const PROFILE_DIMENSIONS = [
  "answer_relevance",
  "knowledge_accuracy",
  "reasoning_depth",
  "problem_solving",
  "experience_evidence",
  "communication_clarity",
  "delivery_fluency",
  "reflection_growth",
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

export const PROFILE_DIMENSION_LABELS: Record<ProfileDimension, string> = {
  answer_relevance: "扣题与完整性",
  knowledge_accuracy: "知识准确性",
  reasoning_depth: "分析深度与取舍",
  problem_solving: "问题拆解与方案",
  experience_evidence: "经历证据与结果",
  communication_clarity: "表达结构与清晰度",
  delivery_fluency: "口语流畅与节奏",
  reflection_growth: "复盘学习与改进",
};

export const PROFILE_INSIGHT_KIND_LABELS: Record<ProfileInsightKind, string> = {
  strength: "优势",
  weakness: "短板",
  pattern: "稳定模式",
  training_focus: "训练建议",
};

/**
 * 页面按三组呈现，8 维保留为底层观察信号（历史数据零迁移）。
 * reflection_growth 不在任何组里：它在逐题层面几乎不可观察，
 * 只作为洞察合成阶段的跨场信号存在。
 */
export const PROFILE_DIMENSION_GROUPS = [
  {
    key: "content",
    label: "内容力",
    description: "知识、分析与方案能力",
    dimensions: ["knowledge_accuracy", "reasoning_depth", "problem_solving"],
  },
  {
    key: "evidence",
    label: "证据力",
    description: "扣题程度与经历支撑",
    dimensions: ["answer_relevance", "experience_evidence"],
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

const LEGACY_DIMENSION_MAP: Record<string, ProfileDimension> = {
  technical_knowledge: "knowledge_accuracy",
  problem_solving: "problem_solving",
  project_storytelling: "experience_evidence",
  behavioral_examples: "experience_evidence",
  communication_structure: "communication_clarity",
  learning_progress: "reflection_growth",
};

export function normalizeProfileDimension(value: string): ProfileDimension | null {
  if ((PROFILE_DIMENSIONS as readonly string[]).includes(value)) {
    return value as ProfileDimension;
  }
  return LEGACY_DIMENSION_MAP[value] ?? null;
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

export type ProfileEvidenceItem = {
  observationId?: string;
  interviewId: string;
  questionId: string;
  sourceType: ProfileSourceType;
  companyName: string;
  jobTitle: string;
  roleKey: string | null;
  question: string;
  answer: string;
  category: string;
  score: number | null;
  feedback: string;
  updatedAt: string;
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
// v4：评估前加了回答信息量闸门，升版本触发全量重建，冲掉垃圾回答产生的观察。
export const PROFILE_ASSESSMENT_VERSION = "ability-assessment-v4";
export const PROFILE_AGGREGATION_VERSION = "candidate-profile-scoring-v3-real-priority";
export const PROFILE_PROMPT_VERSION = "candidate-profile-v4-coach";
export const PROFILE_DEBOUNCE_MS = 60_000;
export const PROFILE_AGENT_TIMEOUT_MS = 60_000;
