export const DEFAULT_MAX_SYNC_PAGES = 200;

export type BossSyncStopReason =
  | "empty-page"
  | "max-pages"
  | "no-more-pages";

export type BossSyncStopDecision = {
  shouldStop: boolean;
  stopReason: BossSyncStopReason | null;
};

export type BossSyncStopInput = {
  candidateCount: number;
  hasMore: boolean | null;
  maxPages: number;
  page: number;
};

export function parseBossSyncMaxPages(args: string[]): number {
  const rawValue = args
    .find((arg) => arg.startsWith("--pages="))
    ?.slice("--pages=".length);
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_SYNC_PAGES;
  }

  return parsed;
}

export function getBossSyncStopDecision(
  input: BossSyncStopInput,
): BossSyncStopDecision {
  if (input.hasMore === false) {
    return { shouldStop: true, stopReason: "no-more-pages" };
  }

  if (input.candidateCount === 0) {
    return { shouldStop: true, stopReason: "empty-page" };
  }

  if (input.page >= input.maxPages) {
    return { shouldStop: true, stopReason: "max-pages" };
  }

  return { shouldStop: false, stopReason: null };
}
