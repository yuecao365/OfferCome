import {
  APPLICATION_STAGES,
  stageLabel,
  type ApplicationStage,
  type ApplicationTrendGranularity,
  type ApplicationTrendPoint,
  type ApplicationTrendRange,
} from "./types";

export type ApplicationStageCountRow = {
  stage: string | null;
  _count: { _all: number };
};

export type CareerFlowSnapshot = {
  total: number;
  pending: number;
  assessment: number;
  interviewOrLater: number;
  rejected: number;
  rounds: {
    firstInterview: number;
    secondInterview: number;
    thirdInterview: number;
    hrInterview: number;
    offer: number;
  };
};

export type ApplicationStageChartPoint = {
  stage: ApplicationStage;
  label: string;
  count: number;
};

export type ApplicationTrendRangeOption = {
  value: ApplicationTrendRange;
  label: string;
  description: string;
  granularity: ApplicationTrendGranularity;
  granularityLabel: string;
};

export const APPLICATION_TREND_RANGE_OPTIONS: ApplicationTrendRangeOption[] = [
  {
    value: "14d",
    label: "14 天",
    description: "最近 14 天",
    granularity: "day",
    granularityLabel: "天",
  },
  {
    value: "30d",
    label: "1 个月",
    description: "最近 1 个月",
    granularity: "day",
    granularityLabel: "天",
  },
  {
    value: "90d",
    label: "3 个月",
    description: "最近 3 个月",
    granularity: "week",
    granularityLabel: "周",
  },
  {
    value: "365d",
    label: "1 年",
    description: "最近 1 年",
    granularity: "month",
    granularityLabel: "月",
  },
];

const applicationTrendRangeValues = new Set<ApplicationTrendRange>(
  APPLICATION_TREND_RANGE_OPTIONS.map((option) => option.value),
);

function toLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseApplicationTrendRange(
  value: string | string[] | undefined,
): ApplicationTrendRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && applicationTrendRangeValues.has(candidate as ApplicationTrendRange)
    ? (candidate as ApplicationTrendRange)
    : "14d";
}

export function getApplicationTrendRangeOption(
  range: ApplicationTrendRange,
): ApplicationTrendRangeOption {
  return APPLICATION_TREND_RANGE_OPTIONS.find((option) => option.value === range) ??
    APPLICATION_TREND_RANGE_OPTIONS[0]!;
}

export function getApplicationTrendStart(
  now: Date,
  range: ApplicationTrendRange,
): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "365d") {
    start.setDate(1);
    start.setMonth(start.getMonth() - 11);
    return start;
  }

  const days = range === "14d" ? 14 : range === "30d" ? 30 : 90;
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function formatShortDate(value: Date): string {
  return `${value.getMonth() + 1}/${value.getDate()}`;
}

function buildDailyTrend(
  dates: Date[],
  start: Date,
  dayCount: number,
): ApplicationTrendPoint[] {
  const counts = new Map<string, number>();

  for (const date of dates) {
    const key = toLocalDateKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const key = toLocalDateKey(date);

    return {
      periodStart: key,
      label: formatShortDate(date),
      count: counts.get(key) ?? 0,
    };
  });
}

function calendarDayNumber(value: Date): number {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000;
}

function buildWeeklyTrend(
  dates: Date[],
  start: Date,
  dayCount: number,
): ApplicationTrendPoint[] {
  const pointCount = Math.ceil(dayCount / 7);
  const counts = Array.from({ length: pointCount }, () => 0);
  const firstDay = calendarDayNumber(start);

  for (const date of dates) {
    const index = Math.floor((calendarDayNumber(date) - firstDay) / 7);
    if (index >= 0 && index < pointCount) counts[index] += 1;
  }

  return counts.map((count, index) => {
    const periodStart = new Date(start);
    periodStart.setDate(periodStart.getDate() + index * 7);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + Math.min(6, dayCount - index * 7 - 1));

    return {
      periodStart: toLocalDateKey(periodStart),
      label: `${formatShortDate(periodStart)}–${formatShortDate(periodEnd)}`,
      count,
    };
  });
}

function toMonthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthlyTrend(dates: Date[], start: Date): ApplicationTrendPoint[] {
  const counts = new Map<string, number>();

  for (const date of dates) {
    const key = toMonthKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: 12 }, (_, index) => {
    const month = new Date(start);
    month.setMonth(month.getMonth() + index);
    const key = toMonthKey(month);

    return {
      periodStart: `${key}-01`,
      label: `${String(month.getFullYear()).slice(-2)}/${month.getMonth() + 1}`,
      count: counts.get(key) ?? 0,
    };
  });
}

export function buildApplicationTrend(
  dates: Date[],
  start: Date,
  range: ApplicationTrendRange,
): ApplicationTrendPoint[] {
  if (range === "365d") return buildMonthlyTrend(dates, start);
  if (range === "90d") return buildWeeklyTrend(dates, start, 90);
  return buildDailyTrend(dates, start, range === "14d" ? 14 : 30);
}

function createEmptyStageCounts(): Record<ApplicationStage, number> {
  return Object.fromEntries(
    APPLICATION_STAGES.map((stage) => [stage, 0]),
  ) as Record<ApplicationStage, number>;
}

export function toApplicationStageCounts(
  rows: ApplicationStageCountRow[],
): Record<ApplicationStage, number> {
  const counts = createEmptyStageCounts();

  for (const row of rows) {
    if (
      row.stage &&
      (APPLICATION_STAGES as readonly string[]).includes(row.stage)
    ) {
      counts[row.stage as ApplicationStage] += row._count._all;
    } else {
      counts.applied += row._count._all;
    }
  }

  return counts;
}

export function buildCareerFlowSnapshot(
  counts: Record<ApplicationStage, number>,
): CareerFlowSnapshot {
  const interviewOrLater =
    counts.first_interview +
    counts.second_interview +
    counts.third_interview +
    counts.hr_interview +
    counts.offer;

  return {
    total: APPLICATION_STAGES.reduce((sum, stage) => sum + counts[stage], 0),
    pending: counts.applied,
    assessment: counts.assessment,
    interviewOrLater,
    rejected: counts.rejected,
    rounds: {
      firstInterview: counts.first_interview,
      secondInterview: counts.second_interview,
      thirdInterview: counts.third_interview,
      hrInterview: counts.hr_interview,
      offer: counts.offer,
    },
  };
}

export function buildApplicationStageChartData(
  counts: Record<ApplicationStage, number>,
): ApplicationStageChartPoint[] {
  return APPLICATION_STAGES.map((stage) => ({
    stage,
    label: stageLabel(stage),
    count: counts[stage],
  }));
}
