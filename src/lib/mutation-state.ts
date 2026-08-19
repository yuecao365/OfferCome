/** Result shape shared by the small server actions that are called from client components. */
export type MutationState = {
  status: "success" | "error";
  message: string;
};

export function toMutationError(
  error: unknown,
  fallback: string,
): MutationState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}
