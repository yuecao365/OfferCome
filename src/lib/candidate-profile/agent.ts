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
    system: `你是候选人长期能力画像总结器。服务端已经确定等级、趋势、证据权重和适用性；你只能根据输入中的已验证观察，提炼优势、短板、稳定模式和可执行训练建议，不能重新打分。

不足两场有效面试的维度不会提供给你，不得输出确定结论。每条洞察必须引用真实 observationId；引用的观察必须与洞察维度一致。用户锁定洞察不得覆盖或改写。禁止推断人格、情绪、口音优劣、身份属性或录用概率。避免空泛描述，优先说明稳定表现、边界条件和下一步训练动作。版本：${PROFILE_PROMPT_VERSION}`,
    payload: input,
  });

  return {
    synthesis: output,
    provider: config.provider,
    model: config.model,
  };
}
