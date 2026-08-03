export type MockInterviewGenerationErrorCode =
  | "job_blueprint_failed"
  | "question_output_invalid"
  | "question_validation_failed"
  | "model_timeout"
  | "model_unavailable";

export class MockInterviewGenerationError extends Error {
  readonly code: MockInterviewGenerationErrorCode;
  readonly retryable: boolean;

  constructor(input: {
    code: MockInterviewGenerationErrorCode;
    message: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "MockInterviewGenerationError";
    this.code = input.code;
    this.retryable = input.retryable ?? true;
  }
}

export function isMockInterviewGenerationError(
  error: unknown,
): error is MockInterviewGenerationError {
  return error instanceof MockInterviewGenerationError;
}
