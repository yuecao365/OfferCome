import { evaluateMockInterviewQuestion } from "@/lib/mock-interviews/question-evaluation-agent";
import type { TrialEvaluation, TrialQuestion } from "@/lib/trial/interview";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  question: TrialQuestion;
  answer: string;
  jobTitle: string;
  jobDescription: string;
};

/**
 * 逐题评分。按出题时预生成的 rubric 打分，保证同一道题的尺子始终一致。
 * 体验版仍走旧题库流程、存旧形状：评分 v2 的短板与建议折回 improvements，等对话式对齐后一起改。
 */
export const POST = withTrialAi<Body>(async (body) => {
  const { evaluation, score } = await evaluateMockInterviewQuestion({
    question: body.question.question,
    answer: body.answer,
    rubric: body.question.rubric,
    expectedSignals: body.question.expectedSignals,
    jobTitle: body.jobTitle,
    jobDescription: body.jobDescription,
    thread: null,
    round: null,
  });

  const trial: TrialEvaluation = {
    score,
    feedback: evaluation.feedback,
    strengths: evaluation.strengths.map((item) => item.point),
    improvements: [...evaluation.weaknesses.map((item) => item.point), ...evaluation.advice],
    dimensions: evaluation.dimensions.map(({ name, score: value, evidence }) => ({ name, score: value, evidence })),
  };
  return { evaluation: trial };
});
