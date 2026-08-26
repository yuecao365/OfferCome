import "server-only";

import { z } from "zod";

import { runAgent } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import {
  parseQuestionEvaluationInput,
  validateQuestionEvaluation,
  type MockInterviewQuestionEvaluation,
} from "./question-evaluation";
import { MOCK_INTERVIEW_PROMPT_VERSION } from "./types";

const questionEvaluationSchema = z.object({
  dimensions: z.array(
    z.object({
      name: z.string().min(1).max(100),
      score: z.number().min(0).max(100),
      evidence: z.string().max(500),
    }),
  ),
  strengths: z.array(z.string().max(300)).max(5),
  improvements: z.array(z.string().max(300)).max(5),
  feedback: z.string().min(1).max(1_000),
});

export async function evaluateMockInterviewQuestion(input: {
  question: string;
  answer: string;
  rubric: unknown;
  expectedSignals: unknown;
  jobTitle: string;
  jobDescription: string;
}): Promise<MockInterviewQuestionEvaluation> {
  const parsed = parseQuestionEvaluationInput(input);
  if (parsed.rubric.length === 0) {
    throw new Error("这道题缺少有效的评分标准。");
  }

  const { output } = await runAgent({
    agent: "question_evaluation",
    config: await getAiTaskConfig("text"),
    feature: "AI 模拟面试",
    promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
    schema: questionEvaluationSchema,
    maxOutputTokens: 2_000,
    timeoutMs: 30_000,
    untrustedInputs: "岗位描述、问题、回答和评分标准",
    system: `你是模拟面试逐题评分 Agent。只根据预先确定的 rubric 维度和候选人的实际回答评分。dimension name 必须逐字使用 rubric 中的名称；每个维度给出 0 到 100 的分数和回答中的具体证据，没有证据时不得臆测。评价用于训练，不输出录用或淘汰结论。提示词版本：${MOCK_INTERVIEW_PROMPT_VERSION}`,
    payload: {
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription.slice(0, 12_000),
      question: input.question,
      answer: input.answer.slice(0, 20_000),
      rubric: parsed.rubric,
      expectedSignals: parsed.expectedSignals,
    },
  });
  return validateQuestionEvaluation(
    output as MockInterviewQuestionEvaluation,
    parsed.rubric,
  );
}
