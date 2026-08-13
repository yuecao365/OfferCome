export type MockInterviewGenerationErrorCode =
  | "job_blueprint_failed"
  | "question_output_invalid"
  | "question_validation_failed"
  | "model_timeout"
  | "model_unavailable";

export class MockInterviewGenerationError extends Error {
  readonly code: MockInterviewGenerationErrorCode;
  readonly retryable: boolean;
  readonly context: import("./types").MockInterviewGenerationErrorContext | null;

  constructor(input: {
    code: MockInterviewGenerationErrorCode;
    message: string;
    retryable?: boolean;
    context?: import("./types").MockInterviewGenerationErrorContext;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "MockInterviewGenerationError";
    this.code = input.code;
    this.retryable = input.retryable ?? true;
    this.context = input.context ?? null;
  }
}

export function isMockInterviewGenerationError(
  error: unknown,
): error is MockInterviewGenerationError {
  return error instanceof MockInterviewGenerationError;
}
