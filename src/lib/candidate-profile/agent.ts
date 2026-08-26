import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
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

export async function synthesizeCandidateInsights(input: {
  roleKey: string;
  metrics: unknown;
  observations: unknown;
  lockedInsights: unknown;
}): Promise<{ synthesis: ProfileSynthesis; provider: string; model: string }> {
  const config = await getAiTaskConfig("text");

  const { output } = await runAgent({
    agent: "profile_synthesis",
    config,
    feature: "画像总结",
    promptVersion: PROFILE_PROMPT_VERSION,
    schema: profileSynthesisSchema,
    timeoutMs: PROFILE_AGENT_TIMEOUT_MS,
    untrustedInputs: "观察摘录、问题和岗位信息",
    system: `你是候选人的面试教练。服务端已经确定等级、趋势、证据权重和适用性；你根据输入中的已验证观察提炼洞察，不能重新打分。

每条洞察写成教练反馈：要么明确"哪里做得不错、继续保持"（strength），要么明确"哪里薄弱、具体练什么"（weakness/training_focus），落到可执行的动作上，不写空泛评语。允许提出跨面试、跨维度的稳定模式（pattern），跨维度引用观察是合法的；数据少时照常输出，但措辞用"初步来看"这类留有余地的表述。每条洞察必须引用真实 observationId，不得虚构。用户锁定洞察不得覆盖或改写。禁止推断人格、情绪、口音优劣、身份属性或录用概率。版本：${PROFILE_PROMPT_VERSION}`,
    payload: input,
  });

  return {
    synthesis: output,
    provider: config.provider,
    model: config.model,
  };
}
