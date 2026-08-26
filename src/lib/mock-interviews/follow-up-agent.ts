import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { MOCK_INTERVIEW_PROMPT_VERSION } from "./types";

const followUpSchema = z.object({
  shouldFollowUp: z.boolean(),
  question: z.string().max(400).nullable(),
  expectedSignals: z.array(z.string().min(1).max(240)).min(1).max(5),
});

export type FollowUpResult = z.infer<typeof followUpSchema>;

export async function generateMockInterviewFollowUp(input: {
  question: string;
  answer: string;
  competency: { name: string; jdEvidence: string } | null;
  expectedSignals: string[];
}): Promise<FollowUpResult | null> {
  try {
    const { output } = await runAgent({
      agent: "follow_up",
      config: await getAiTaskConfig("text"),
      feature: "AI 模拟面试",
      promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
      schema: followUpSchema,
      timeoutMs: 20_000,
      untrustedInputs: "问题、回答和岗位能力",
      system: `你是模拟面试追问 Agent。只有回答存在明显可深化的缺口时才追问；追问必须仍属于同一岗位能力，不能引入新主题，不得泄露评分标准或期望信号。问题简洁、可直接作答。提示词版本：${MOCK_INTERVIEW_PROMPT_VERSION}`,
      payload: input,
    });
    // 追问只是锦上添花：宁可这一轮没有追问，也不能让报错打断面试。
    return output.shouldFollowUp && output.question?.trim()
      ? { ...output, question: output.question.trim() }
      : null;
  } catch {
    return null;
  }
}
