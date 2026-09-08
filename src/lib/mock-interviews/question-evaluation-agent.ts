import "server-only";

import { z } from "zod";

import { logAgentRun, runAgent } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import {
  parseQuestionEvaluationInput,
  validateQuestionEvaluation,
  WEAKNESS_KINDS,
  type EvaluationMetrics,
  type EvaluationThreadContext,
  type MockInterviewQuestionEvaluation,
} from "./question-evaluation";
import { computeQuestionScore } from "./scoring";

export const EVALUATION_PROMPT_VERSION = "evaluation-v2";

const questionEvaluationSchema = z.object({
  dimensions: z.array(
    z.object({
      name: z.string().min(1).max(100),
      score: z.number().min(0).max(100),
      evidence: z.string().max(500).describe("支持这个分数的回答原话"),
      gap: z.string().max(300).nullable().describe("这个维度缺了什么、错在哪；没有就 null"),
    }),
  ),
  strengths: z
    .array(z.object({ point: z.string().min(1).max(200), quote: z.string().max(200).describe("逐字摘自回答") }))
    .max(4),
  weaknesses: z
    .array(
      z.object({
        point: z.string().min(1).max(200),
        quote: z.string().max(200).nullable().describe("error 时必填，逐字摘自回答；missing 可为 null"),
        kind: z.enum(WEAKNESS_KINDS),
      }),
    )
    .max(4),
  advice: z.array(z.string().min(1).max(300)).max(3),
  feedback: z.string().min(1).max(800),
});

const ROUND_LABELS: Record<string, string> = {
  first_interview: "技术一面",
  second_interview: "技术二面",
  hr_interview: "HR 面",
};

function systemPrompt(round: string | null): string {
  return `你是模拟面试逐题评分 Agent，只根据预先确定的 rubric 维度和候选人的实际回答评分，评价用于训练，不输出录用或淘汰结论。

输入里的 thread 是这段问答的过程信号：面试官按深度递进追问，越深越往失守点问；追到第 n 层答不上属于正常，按候选人实际达到的深度给分，不按"完美答案"扣分。note 是面试官关掉这段时的现场判断，你的分数与它明显不一致时在 feedback 里说明理由。expectedSignals 是备课时写的参考，候选人从别的角度答到位同样给分，不按清单扣。

分带（本场是${ROUND_LABELS[round ?? ""] ?? "技术面"}；校招 / 社招从回答与简历里的经验判断）：90 以上 = 准确、有取舍、能迁移，面试官会继续加深追问；70–89 = 主干正确、细节或取舍有欠缺，达到该轮次常规要求；50–69 = 有基本尝试但关键点缺失或不稳；50 以下 = 关键内容错误或基本没答。

输出要求：dimension name 逐字使用 rubric 里的名称；evidence 是支持分数的回答原话，gap 写这个维度缺了什么。strengths 的 quote、weaknesses 里 kind=error 的 quote 必须逐字摘自回答，不在回答里的引用会被系统丢弃；kind=missing 用于追问到了但没答上或答偏的地方，point 里写清是哪一层追问。advice 每条对应至少一条 weakness，写练什么。feedback 是给候选人看的一段话，不报分数。提示词版本：${EVALUATION_PROMPT_VERSION}`;
}

export async function evaluateMockInterviewQuestion(input: {
  question: string;
  answer: string;
  rubric: unknown;
  expectedSignals: unknown;
  jobTitle: string;
  jobDescription: string;
  thread: EvaluationThreadContext | null;
  round: string | null;
}): Promise<{ evaluation: MockInterviewQuestionEvaluation; score: number; metrics: EvaluationMetrics }> {
  const parsed = parseQuestionEvaluationInput(input);
  if (parsed.rubric.length === 0) {
    throw new Error("这道题缺少有效的评分标准。");
  }
  const config = await getAiTaskConfig("text");
  const startedAt = Date.now();
  const { output, runId } = await runAgent({
    agent: "question_evaluation",
    config,
    feature: "AI 模拟面试",
    promptVersion: EVALUATION_PROMPT_VERSION,
    schema: questionEvaluationSchema,
    maxOutputTokens: 2_400,
    timeoutMs: 40_000,
    untrustedInputs: "岗位描述、问题、回答、评分标准和面试官备注",
    system: systemPrompt(input.round),
    payload: {
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription.slice(0, 12_000),
      question: input.question,
      answer: input.answer.slice(0, 20_000),
      rubric: parsed.rubric,
      expectedSignals: parsed.expectedSignals,
      thread: input.thread,
    },
  });
  const score = computeQuestionScore(parsed.rubric, output.dimensions);
  const validated = validateQuestionEvaluation(output, parsed.rubric, input.answer, score);
  logAgentRun({
    runId,
    agent: "question_evaluation",
    event: "selection",
    status: "success",
    provider: config.provider,
    model: config.model,
    promptVersion: EVALUATION_PROMPT_VERSION,
    durationMs: Date.now() - startedAt,
    metrics: { score, ...validated.metrics, weaknessCount: validated.evaluation.weaknesses.length },
  });
  return { ...validated, score };
}
