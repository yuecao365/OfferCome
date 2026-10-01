import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import { localeOfContent, type ContentLanguage } from "@/lib/i18n/locale";
import { promptVersionFor } from "@/lib/mock-interviews/types";
import { getAiTaskConfig } from "@/lib/settings/ai";

import {
  PROFILE_AGENT_TIMEOUT_MS,
  PROFILE_ASSESSMENT_VERSION,
  PROFILE_DIMENSIONS,
  PROFILE_DIMENSION_LABELS_I18N,
  type ProfileDimension,
} from "./types";

/**
 * 真实面试的逐题评估：真实面试没有评分表和逐段评分，只能让模型读回答。
 * 模拟面试不走这里（观察由逐段评分推导，见 derive.ts）。delivery_fluency 只由语音指标代码推导。
 */
const TEXT_ASSESSMENT_DIMENSIONS = PROFILE_DIMENSIONS.filter(
  (dimension) => dimension !== "delivery_fluency",
) as Exclude<ProfileDimension, "delivery_fluency">[];

const observationSchema = z.object({
  observations: z.array(
    z.object({
      questionId: z.string(),
      dimension: z.enum(TEXT_ASSESSMENT_DIMENSIONS),
      score: z.number().min(1).max(5),
      confidence: z.number().min(0).max(1),
      evidenceExcerpt: z.string().min(1).max(300),
    }),
  ),
});

export type AssessedObservation = z.infer<
  typeof observationSchema
>["observations"][number];

function normalizedQuote(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").trim();
}

function validateAssessedObservations(
  observations: AssessedObservation[],
  answersByQuestionId: Map<string, string>,
): AssessedObservation[] {
  const unique = new Set<string>();
  return observations.filter((observation) => {
    const answer = answersByQuestionId.get(observation.questionId);
    const key = `${observation.questionId}:${observation.dimension}`;
    if (!answer || unique.has(key)) return false;
    if (!normalizedQuote(answer).includes(normalizedQuote(observation.evidenceExcerpt))) {
      return false;
    }
    unique.add(key);
    return true;
  });
}

/** 提示词散文按内容语言各一份；维度清单、schema、逐字校验只有一份（docs/i18n-plan.md §3）。 */
const ASSESSMENT_COPY: Record<ContentLanguage, { untrustedInputs: string; system: (dimensionList: string, promptVersion: string) => string }> = {
  zh: {
    untrustedInputs: "面试问答内容",
    system: (dimensionList, promptVersion) => `你是结构化面试评估器。逐题判断哪些维度适用，只输出适用维度；不适用必须省略，不能按 0 分处理。可评估维度：
${dimensionList}

每项使用带行为锚点的 1–5 级量表：1=关键内容明显缺失或错误，2=有基本尝试但不稳定，3=达到常规面试要求且大体完整，4=证据充分并有清晰分析，5=准确、深入、可迁移且有明确取舍。

evidenceExcerpt 必须逐字摘自对应回答，不得改写。confidence 只表示本次观察能否由摘录支持。不要从文本推断口语流畅度、节奏、情绪、性格、口音、身份或录用概率。版本：${promptVersion}`,
  },
  en: {
    untrustedInputs: "the interview questions and answers",
    system: (dimensionList, promptVersion) => `You are a structured interview assessor. For each question, decide which dimensions apply and output only those; leave out any dimension that does not apply rather than scoring it 0. Dimensions you can assess:
${dimensionList}

Score each one on a 1-5 scale with behavioural anchors: 1 = key content clearly missing or wrong; 2 = a real attempt, but patchy; 3 = meets the usual interview bar and is broadly complete; 4 = well evidenced, with clear analysis; 5 = accurate, deep, transferable, with explicit trade-offs.

evidenceExcerpt must be copied word for word from the matching answer, in the language the answer was given in; never paraphrase or translate it. confidence only says how well the excerpt supports this observation. Do not infer spoken fluency, pacing, emotion, personality, accent, identity or the odds of getting an offer from the text. Version: ${promptVersion}`,
  },
};

export async function assessInterviewQuestions(input: {
  companyName: string;
  jobTitle: string;
  sourceType: string;
  questions: Array<{ id: string; question: string; answer: string; category: string }>;
  /** 提示词语言（界面语言）；摘录永远是回答原文。体验版从请求体带来，不认识的值按中文。 */
  language?: ContentLanguage;
}): Promise<{
  observations: AssessedObservation[];
  provider: string;
  model: string;
}> {
  const { language: requested, ...payload } = input;
  const language: ContentLanguage = requested === "en" ? "en" : "zh";
  const copy = ASSESSMENT_COPY[language];
  const labels = PROFILE_DIMENSION_LABELS_I18N[localeOfContent(language)];
  const dimensionList = TEXT_ASSESSMENT_DIMENSIONS.map((id) => `- ${id}: ${labels[id]}`).join("\n");
  const promptVersion = promptVersionFor(PROFILE_ASSESSMENT_VERSION, language);
  const config = await getAiTaskConfig("text");

  const { output } = await runAgent({
    agent: "profile_assessment",
    config,
    feature: "能力评估",
    promptVersion,
    language,
    schema: observationSchema,
    timeoutMs: PROFILE_AGENT_TIMEOUT_MS,
    untrustedInputs: copy.untrustedInputs,
    system: copy.system(dimensionList, promptVersion),
    payload,
  });
  const answers = new Map(input.questions.map((item) => [item.id, item.answer]));
  return {
    observations: validateAssessedObservations(output.observations, answers),
    provider: config.provider,
    model: config.model,
  };
}
