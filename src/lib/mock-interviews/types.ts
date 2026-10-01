import type { Estimate } from "@/lib/interview/estimator";
import { z } from "zod";

import type { InterviewStatus } from "@/lib/interviews/types";

import type { Conversation, Trace } from "@/lib/interview/views";

import type { InterviewMaterials } from "./materials";
import type { ReviewTrail } from "@/lib/interview/review-trail";

import type { AnswerExemplar, EvaluationStrength, EvaluationWeakness, ResumeCheck } from "./question-evaluation";
import type { MockInterviewReport } from "./report";
import { localizedLabels, type ContentLanguage } from "@/lib/i18n/locale";

/** 题目生成完成、房间可以开始作答时，关联的 Interview 记录进入这个状态。 */
export const ACTIVE_MOCK_INTERVIEW_STATUS: InterviewStatus = "in_progress";

/** 旧会话可能是 voice；新会话一律 text，语音只是输入方式（麦克风转写进输入框）。 */
export const MOCK_INTERVIEW_MODES = ["text", "voice"] as const;
export type MockInterviewMode = (typeof MOCK_INTERVIEW_MODES)[number];

export const MOCK_INTERVIEW_MODE_LABELS: Record<MockInterviewMode, string> = {
  text: "文字面试",
  voice: "语音面试",
};

/** 界面按语言取：`MOCK_INTERVIEW_MODE_LABELS_I18N[locale][key]`（docs/i18n-plan.md）。 */
export const MOCK_INTERVIEW_MODE_LABELS_I18N = localizedLabels(MOCK_INTERVIEW_MODE_LABELS, { text: "Text interview", voice: "Voice interview" });

export function isMockInterviewMode(value: string): value is MockInterviewMode {
  return (MOCK_INTERVIEW_MODES as readonly string[]).includes(value);
}

/** 蓝图 schema 的字段说明会随 JSON Schema 发给模型：按面试语言给一份，结构只有一份。 */
const BLUEPRINT_SCHEMA_COPY = {
  zh: {
    jdEvidence: "从 JD 原文逐字截取的短证据",
    sourceUrl: "来源必须是 HTTP(S) 地址",
    product: "团队做什么产品、给谁用",
    systems: "核心系统或链路",
    constraints: "规模、合规、延迟等约束",
    summary: "仅根据 JD 总结岗位实际工作重点，不加入候选人历史",
  },
  en: {
    jdEvidence: "Short evidence copied verbatim from the JD text",
    sourceUrl: "Source must be an HTTP(S) URL",
    product: "What product the team builds and who uses it",
    systems: "Core systems or pipelines",
    constraints: "Constraints such as scale, compliance or latency",
    summary: "The role's actual focus, summarised from the JD only, without any candidate history",
  },
} satisfies Record<ContentLanguage, Record<string, string>>;

function jobBlueprintSchemas(language: ContentLanguage) {
  const copy = BLUEPRINT_SCHEMA_COPY[language];
  const competency = z.object({
    id: z.string().min(1).max(40),
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(400),
    jdEvidence: z.string().min(1).max(240).describe(copy.jdEvidence),
    // 严格模式要求每个字段都 required：可空用 nullable，不用 default/optional。
    origin: z.enum(["jd", "inferred"]),
    sourceUrl: z
      .string()
      .max(500)
      .refine((value) => /^https?:\/\//i.test(value), copy.sourceUrl)
      .nullable(),
  });
  const business = z.object({
    product: z.string().min(1).max(200).nullable().describe(copy.product),
    systems: z.array(z.string().min(1).max(80)).max(5).describe(copy.systems),
    constraints: z.string().min(1).max(200).nullable().describe(copy.constraints),
  });
  const blueprint = z.object({
    summary: z.string().min(1).max(1_000).describe(copy.summary),
    completeness: z.enum(["complete", "partial", "minimal"]),
    missingInformation: z.array(z.string().min(1).max(200)).max(6),
    competencies: z.array(competency).min(0).max(10),
    /** 业务：团队做什么、核心系统或链路、约束。JD 没写就是 null，不猜。场景题落在 systems 上，面试官人设带 product。 */
    business: business.nullable(),
  });
  return { competency, business, blueprint };
}

const zhBlueprintSchemas = jobBlueprintSchemas("zh");
const jobCompetencySchema = zhBlueprintSchemas.competency;

/** 发给模型的蓝图 schema。 */
export const jobBusinessSchema = zhBlueprintSchemas.business;
export type JobBusiness = z.infer<typeof jobBusinessSchema>;

export const mockInterviewJobBlueprintSchema = zhBlueprintSchemas.blueprint;

/** 按面试语言取发给模型的蓝图 schema（形状相同，只有字段说明的语言不同）。 */
export const JOB_BLUEPRINT_SCHEMAS: Record<ContentLanguage, typeof mockInterviewJobBlueprintSchema> = {
  zh: mockInterviewJobBlueprintSchema,
  en: jobBlueprintSchemas("en").blueprint,
};

/** 读会话快照用：早期蓝图没有 origin / sourceUrl / business，解析时补缺省值。 */
export const storedJobBlueprintSchema = mockInterviewJobBlueprintSchema.extend({
  business: jobBusinessSchema.nullable().default(null),
  competencies: z
    .array(
      jobCompetencySchema.extend({
        origin: jobCompetencySchema.shape.origin.default("jd"),
        sourceUrl: jobCompetencySchema.shape.sourceUrl.default(null),
      }),
    )
    .min(0)
    .max(10),
});

export type MockInterviewJobBlueprint = z.infer<
  typeof mockInterviewJobBlueprintSchema
>;
/** 报告页逐段折叠行要的：这段是哪份材料、什么阶段（project / quick / scenario）、切段时的判断（skipped / failed / answered）。 */
export type MockInterviewSegmentInfo = { areaName: string | null; kind: string; verdict: string | null };

export type MockInterviewConversation = Conversation;

export type MockInterviewView = {
  id: string;
  interviewId: string;
  companyName: string;
  jobTitle: string;
  /** 蓝图里的业务（团队做什么、核心链路）；JD 没写为 null。 */
  business: JobBusiness | null;
  status: string;
  generationPhase: string | null;
  generationErrorCode: string | null;
  generationError: string | null;
  generationErrorContext?: MockInterviewGenerationErrorContext | null;
  interactionMode: MockInterviewMode;
  /** 面试语言（房间、报告里模型产出的内容都是这个语言）；没带的视图按 zh。 */
  language?: ContentLanguage;
  questionCount: number;
  totalScore: number | null;
  report: MockInterviewReport | null;
  /** 候选人档案（G4）：这场交卷后写的那一版与改动；没有简历或还没交卷为 null。 */
  dossier: { version: number; changes: string } | null;
  /** 房间资料抽屉：本场的简历原文与岗位描述（会话快照）。 */
  materials: InterviewMaterials;
  /** 旧的分步会话没有简报，为 null，房间按只读回放处理。 */
  conversation?: MockInterviewConversation | null;
  /** 事后的能力估计（完成后才有；没有岗位能力清单为空）。 */
  estimates: Estimate[];
  /** 面试官思路（完成后才有）：每一步为什么这么问、记了什么存疑；纯投影。 */
  trail: ReviewTrail | null;
  questions: {
    id: string;
    question: string;
    answer: string;
    category: string;
    sortOrder: number;
    skipped: boolean;
    segment?: MockInterviewSegmentInfo;
    evaluation: null | {
      score: number | null;
      dimensions: { name: string; score: number; evidence: string; gap: string | null }[];
      strengths: EvaluationStrength[];
      weaknesses: EvaluationWeakness[];
      /** 一句结论（旧记录是原来的长评语）。 */
      verdict: string;
      /** 简历核对；旧记录与旧的体验版数据没有。 */
      resumeChecks?: ResumeCheck[];
      exemplar: AnswerExemplar | null;
    };
  }[];
};

export const MOCK_INTERVIEW_PROMPT_VERSION = "mock-interview-v8-no-priority";

/** 记账与"没配置模型"报错里的功能名。报错句本身由 runAgent 拼（目前只有中文），所以两种语言用同一个名字。 */
export const MOCK_INTERVIEW_FEATURE = "AI 模拟面试";

/** "针对练习"指定的题带进备课（recentWeaknesses 的 practice 项）时的说明句；本地版 context.ts 与体验版同一句。 */
export function practiceRequestNote(language: ContentLanguage = "zh"): string {
  return language === "en" ? "The candidate asked to practise this question again." : "候选人要求重练这道题。";
}

/** 记账用的提示词版本：英文场次带 -en 后缀（trace 与缓存按它区分），中文场次原样。 */
export function promptVersionFor(version: string, language: ContentLanguage): string {
  return language === "en" ? `${version}-en` : version;
}

export const MOCK_INTERVIEW_GENERATION_TIMEOUT_MS = 60_000;

export type MockInterviewGenerationErrorContext = {
  competencyCount?: number;
  requiredCount?: number;
  jobTitle?: string;
  questionCount?: number;
};

export type MockInterviewTrace = Trace;
