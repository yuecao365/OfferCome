export const APPLICATION_STAGES = [
  "applied",
  "assessment",
  "first_interview",
  "second_interview",
  "third_interview",
  "hr_interview",
  "offer",
  "rejected",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];
export type ApplicationStageFilter = ApplicationStage | "all";
export type ApplicationSourceFilter = string | "all";
export type ApplicationSortBy = "updatedAt" | "appliedAt";
export type ApplicationSortDir = "asc" | "desc";
export type ApplicationPageSize = 12 | 20 | 50 | 100;
export type ApplicationTrendRange = "14d" | "30d" | "90d" | "365d";
export type ApplicationTrendGranularity = "day" | "week" | "month";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export type ApplicationFilters = {
  q: string;
  status: ApplicationStageFilter;
  source: ApplicationSourceFilter;
  from: string;
  to: string;
  sortBy: ApplicationSortBy;
  sortDir: ApplicationSortDir;
  page: number;
  pageSize: ApplicationPageSize;
};

export type ApplicationListItem = {
  id: string;
  companyName: string;
  jobTitle: string;
  source: string;
  jobUrl: string;
  stage: ApplicationStage;
  appliedAt: Date;
  lastSeenAt: Date;
  statusUpdatedAt: Date;
  updatedAt: Date;
  autoRejectedAt: Date | null;
  note: string;
};

export type ApplicationStats = {
  total: number;
  recent7Days: number;
  latestSyncedAt: Date | null;
  stageCounts: Record<ApplicationStage, number>;
  recentApplications: ApplicationListItem[];
  trend: ApplicationTrendPoint[];
  sourceCounts: Array<{
    source: string;
    count: number;
  }>;
};

export type ApplicationTrendPoint = {
  periodStart: string;
  label: string;
  count: number;
};

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: "已投递",
  assessment: "笔试/测评",
  first_interview: "一面",
  second_interview: "二面",
  third_interview: "三面",
  hr_interview: "HR 面",
  offer: "Offer",
  rejected: "拒绝",
};

const DEFAULT_PAGE_SIZE: ApplicationPageSize = 12;
const PAGE_SIZES = new Set<ApplicationPageSize>([12, 20, 50, 100]);

export function stageLabel(stage: ApplicationStage): string {
  return APPLICATION_STAGE_LABELS[stage];
}

export function isApplicationStage(value: string): value is ApplicationStage {
  return (APPLICATION_STAGES as readonly string[]).includes(value);
}

export function normalizeApplicationStage(
  value: string | null | undefined,
): ApplicationStage {
  return value && isApplicationStage(value) ? value : "applied";
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value: string): ApplicationPageSize {
  const parsed = parsePositiveInt(value, DEFAULT_PAGE_SIZE);
  return PAGE_SIZES.has(parsed as ApplicationPageSize)
    ? (parsed as ApplicationPageSize)
    : DEFAULT_PAGE_SIZE;
}

function parseDateOnly(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : value;
}

export function parseApplicationFilters(
  searchParams: RawSearchParams,
): ApplicationFilters {
  const rawStatus = firstParam(searchParams.status);
  const rawSortBy = firstParam(searchParams.sortBy);
  const rawSortDir = firstParam(searchParams.sortDir);
  const source = firstParam(searchParams.source).trim();

  return {
    q: firstParam(searchParams.q).trim(),
    status: isApplicationStage(rawStatus) ? rawStatus : "all",
    source: source || "all",
    from: parseDateOnly(firstParam(searchParams.from).trim()),
    to: parseDateOnly(firstParam(searchParams.to).trim()),
    sortBy: rawSortBy === "appliedAt" ? "appliedAt" : "updatedAt",
    sortDir: rawSortDir === "asc" ? "asc" : "desc",
    page: parsePositiveInt(firstParam(searchParams.page), 1),
    pageSize: parsePageSize(firstParam(searchParams.pageSize)),
  };
}
