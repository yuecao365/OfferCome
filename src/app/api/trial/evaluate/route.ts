import { evaluateMockInterviewQuestion } from "@/lib/mock-interviews/question-evaluation-agent";
import { computeQuestionScore } from "@/lib/mock-interviews/scoring";
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

/** 逐题评分。按出题时预生成的 rubric 打分，保证同一道题的尺子始终一致。 */
export const POST = withTrialAi<Body>(async (body) => {
  const output = await evaluateMockInterviewQuestion({
    question: body.question.question,
    answer: body.answer,
    rubric: body.question.rubric,
    expectedSignals: body.question.expectedSignals,
    jobTitle: body.jobTitle,
    jobDescription: body.jobDescription,
  });

  const evaluation: TrialEvaluation = {
    score: computeQuestionScore(body.question.rubric, output.dimensions),
    feedback: output.feedback,
    strengths: output.strengths,
    improvements: output.improvements,
    dimensions: output.dimensions,
  };
  return { evaluation };
});
