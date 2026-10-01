import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import type { ContentLanguage } from "@/lib/i18n/locale";
import { promptVersionFor } from "@/lib/mock-interviews/types";
import { getAiTaskConfig } from "@/lib/settings/ai";

import {
  PROFILE_AGENT_TIMEOUT_MS,
  PROFILE_DIMENSIONS,
  PROFILE_INSIGHT_KINDS,
  PROFILE_PROMPT_VERSION,
} from "./types";

const profileSynthesisSchema = z.object({
  insights: z.array(
    z.object({
      dimension: z.enum(PROFILE_DIMENSIONS),
      kind: z.enum(PROFILE_INSIGHT_KINDS),
      title: z.string().min(1).max(80),
      statement: z.string().min(1).max(500),
      evidence: z.array(
        z.object({
          observationId: z.string(),
          polarity: z.enum(["supports", "contradicts"]),
        }),
      ).min(1).max(8),
    }),
  ).max(24),
});

export type ProfileSynthesis = z.infer<typeof profileSynthesisSchema>;

/** 提示词散文按内容语言各一份；schema、字段名、校验只有一份（docs/i18n-plan.md §3）。 */
const SYNTHESIS_COPY: Record<ContentLanguage, { untrustedInputs: string; system: (promptVersion: string) => string }> = {
  zh: {
    untrustedInputs: "观察摘录、问题和岗位信息",
    system: (promptVersion) => `你是候选人的面试教练。服务端已经确定等级、趋势、证据权重和适用性；你根据输入中的已验证观察提炼洞察，不能重新打分。

每条洞察写成教练反馈：要么明确"哪里做得不错、继续保持"（strength），要么明确"哪里薄弱、具体练什么"（weakness/training_focus），落到可执行的动作上，不写空泛评语。允许提出跨面试、跨维度的稳定模式（pattern），跨维度引用观察是合法的；数据少时照常输出，但措辞用"初步来看"这类留有余地的表述。每条洞察必须引用真实 observationId，不得虚构；ID 只填在 evidence 字段，title 和 statement 是给用户看的正文，不得出现任何 ID。用户锁定洞察不得覆盖或改写。禁止推断人格、情绪、口音优劣、身份属性或录用概率。版本：${promptVersion}`,
  },
  en: {
    untrustedInputs: "observation excerpts, questions and job details",
    system: (promptVersion) => `You are the candidate's interview coach. The server has already settled levels, trends, evidence weights and which dimensions apply; your job is to draw insights from the verified observations in the input. Do not re-score anything.

Write every insight as coaching feedback: either say plainly what is going well and should be kept up (strength), or say plainly where the candidate is weak and exactly what to practise (weakness / training_focus). Land each one on a concrete action; no vague commentary. You may call out stable patterns that recur across interviews and dimensions (pattern); citing observations from other dimensions is fine. When the data is thin, still produce insights, but hedge the wording ("Early signs suggest..."). Every insight must cite real observationIds; never invent one. IDs go only in the evidence field: title and statement are the text the user reads and must not contain any ID. Never overwrite or rewrite insights the user has locked. Do not infer personality, emotions, how good someone's accent is, identity attributes or the odds of getting an offer. Write title and statement in English, even when the observation excerpts are in another language. Version: ${promptVersion}`,
  },
};

export async function synthesizeCandidateInsights(input: {
  roleKey: string;
  metrics: unknown;
  observations: unknown;
  lockedInsights: unknown;
  /** 洞察正文的语言（界面语言）；体验版从请求体带来，不认识的值按中文。 */
  language?: ContentLanguage;
}): Promise<{ synthesis: ProfileSynthesis; provider: string; model: string }> {
  const { language: requested, ...payload } = input;
  const language: ContentLanguage = requested === "en" ? "en" : "zh";
  const copy = SYNTHESIS_COPY[language];
  const promptVersion = promptVersionFor(PROFILE_PROMPT_VERSION, language);
  const config = await getAiTaskConfig("text");

  const { output } = await runAgent({
    agent: "profile_synthesis",
    config,
    feature: "画像总结",
    promptVersion,
    language,
    schema: profileSynthesisSchema,
    timeoutMs: PROFILE_AGENT_TIMEOUT_MS,
    untrustedInputs: copy.untrustedInputs,
    system: copy.system(promptVersion),
    payload,
  });

  return {
    synthesis: output,
    provider: config.provider,
    model: config.model,
  };
}
