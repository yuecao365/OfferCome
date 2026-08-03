import type { BossContactCandidate } from "./parse";

const COMPANY_NAME_KEYS = [
  "companyName",
  "brandName",
  "brandFullName",
  "brandShortName",
  "companyFullName",
  "companyShortName",
] as const;

const JOB_TITLE_KEYS = [
  "jobTitle",
  "jobName",
  "positionName",
  "position",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readSourceActivityAt(value: unknown): Date | null {
  const timestamp = readNumber(value);
  if (!timestamp || timestamp < 1_000_000_000_000) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function findStringByKeys(
  value: unknown,
  keys: readonly string[],
  depth = 0,
): string {
  if (!isRecord(value)) {
    return "";
  }

  for (const key of keys) {
    const text = cleanText(value[key]);

    if (text) {
      return text;
    }
  }

  if (depth >= 2) {
    return "";
  }

  for (const child of Object.values(value)) {
    const text = findStringByKeys(child, keys, depth + 1);

    if (text) {
      return text;
    }
  }

  return "";
}

function visitPayload(
  value: unknown,
  candidates: BossContactCandidate[],
  seenObjects: WeakSet<object>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitPayload(item, candidates, seenObjects);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (seenObjects.has(value)) {
    return;
  }

  seenObjects.add(value);

  const companyName = findStringByKeys(value, COMPANY_NAME_KEYS);
  const jobTitle = findStringByKeys(value, JOB_TITLE_KEYS);

  if (companyName && jobTitle) {
    const sourceId = cleanText(value.encryptJobId);
    candidates.push({
      companyName,
      jobTitle,
      href: sourceId
        ? `https://www.zhipin.com/job_detail/${encodeURIComponent(sourceId)}.html`
        : null,
      sourceId: sourceId || null,
      sourceActivityAt: readSourceActivityAt(value.happenTime),
      sourceStatusCode: readNumber(value.jobValidStatus),
    });
  }

  for (const child of Object.values(value)) {
    visitPayload(child, candidates, seenObjects);
  }
}

export function extractBossContactCandidatesFromApiPayload(
  payload: unknown,
): BossContactCandidate[] {
  const candidates: BossContactCandidate[] = [];
  visitPayload(payload, candidates, new WeakSet<object>());
  return candidates;
}
