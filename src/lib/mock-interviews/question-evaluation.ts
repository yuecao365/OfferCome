import { z } from "zod";

const rubricItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  weight: z.number().positive(),
});

export type MockInterviewQuestionEvaluation = {
  dimensions: { name: string; score: number; evidence: string }[];
  strengths: string[];
  improvements: string[];
  feedback: string;
};

export function parseQuestionEvaluationInput(input: {
  rubric: unknown;
  expectedSignals: unknown;
}) {
  const rubric = z.array(rubricItemSchema).safeParse(input.rubric);
  const expectedSignals = z.array(z.string()).safeParse(input.expectedSignals);
  return {
    rubric: rubric.success ? rubric.data : [],
    expectedSignals: expectedSignals.success ? expectedSignals.data : [],
  };
}

export function validateQuestionEvaluation(
  output: MockInterviewQuestionEvaluation,
  rubric: Array<{ name: string }>,
): MockInterviewQuestionEvaluation {
  const allowedDimensions = new Set(rubric.map((item) => item.name));
  const seen = new Set<string>();
  return {
    ...output,
    dimensions: output.dimensions.filter((dimension) => {
      if (!allowedDimensions.has(dimension.name) || seen.has(dimension.name)) {
        return false;
      }
      seen.add(dimension.name);
      return true;
    }),
  };
}
