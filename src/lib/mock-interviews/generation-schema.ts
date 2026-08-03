import { jsonSchema, zodSchema } from "ai";

import {
  createMockInterviewQuestionBatchSchema,
  providerMockInterviewQuestionBatchSchema,
  type MockInterviewQuestionDraft,
} from "./types";

export function createQuestionOutputSchema(questionCount: number) {
  const exactSchema = createMockInterviewQuestionBatchSchema(questionCount);
  const providerSchema = zodSchema(providerMockInterviewQuestionBatchSchema);

  return jsonSchema<{ questions: MockInterviewQuestionDraft[] }>(
    providerSchema.jsonSchema,
    {
      validate(value) {
        const result = exactSchema.safeParse(value);
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error };
      },
    },
  );
}
