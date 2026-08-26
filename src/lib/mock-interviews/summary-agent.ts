import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { MOCK_INTERVIEW_PROMPT_VERSION } from "./types";

const mockInterviewSummarySchema = z.object({
  summary: z.string().min(1).max(2_000),
  strengths: z.array(z.string().max(500)).max(6),
  improvements: z.array(z.string().max(500)).max(6),
  actionPlan: z.array(z.string().max(500)).max(8),
});

export type MockInterviewSummary = z.infer<typeof mockInterviewSummarySchema>;

export async function summarizeMockInterview(input: {
  jobTitle: string;
  questions: { question: string; score: number; feedback: string }[];
}): Promise<MockInterviewSummary> {
  const { output } = await runAgent({
    agent: "interview_summary",
    config: await getAiTaskConfig("text"),
    feature: "AI 模拟面试",
    promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
    schema: mockInterviewSummarySchema,
    maxOutputTokens: 2_000,
    timeoutMs: 30_000,
    untrustedInputs: "岗位名称、问题和逐题反馈",
    system: `你是模拟面试报告汇总 Agent。根据已完成的逐题评分总结整体表现、优势、改进方向和行动计划。不得重新评分，不得计算或输出总分，不得臆造逐题反馈之外的表现。提示词版本：${MOCK_INTERVIEW_PROMPT_VERSION}`,
    payload: {
      jobTitle: input.jobTitle,
      questions: input.questions.map((question) => ({
        question: question.question.slice(0, 800),
        score: question.score,
        feedback: question.feedback.slice(0, 600),
      })),
    },
  });
  return output;
}
