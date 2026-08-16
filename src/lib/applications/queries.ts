import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import {
  buildApplicationTrend,
  getApplicationTrendStart,
  toApplicationStageCounts,
} from "./analytics";
import {
  type ApplicationFilters,
  type ApplicationListItem,
  type ApplicationStats,
  type ApplicationTrendRange,
  normalizeApplicationStage,
} from "./types";

type BossContactRow = {
  id: string;
  companyName: string;
  jobTitle: string;
  source: string;
  jobUrl: string | null;
  jobDescription: string | null;
  stage: string | null;
  appliedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  sourceActivityAt: Date | null;
  unchangedSince: Date | null;
  updatedAt: Date;
  autoRejectedAt: Date | null;
  note: string | null;
};

export type ApplicationsResult = {
  items: ApplicationListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ApplicationFilterOptions = {
  sources: string[];
};

const APPLICATION_SELECT = {
  id: true,
  companyName: true,
  jobTitle: true,
  source: true,
  jobUrl: true,
  jobDescription: true,
  stage: true,
  appliedAt: true,
  firstSeenAt: true,
  lastSeenAt: true,
  sourceActivityAt: true,
  unchangedSince: true,
  updatedAt: true,
  autoRejectedAt: true,
  note: true,
} satisfies Prisma.BossContactSelect;

export function toApplicationListItem(row: BossContactRow): ApplicationListItem {
  return {
    id: row.id,
    companyName: row.companyName,
    jobTitle: row.jobTitle,
    source: row.source,
    jobUrl: row.jobUrl ?? "",
    jobDescription: row.jobDescription ?? "",
    stage: normalizeApplicationStage(row.stage),
    appliedAt: row.appliedAt ?? row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    // “状态更新”展示 Boss 的最后互动时间，没有互动记录时退回本地时间线。
    statusUpdatedAt:
      row.sourceActivityAt ??
      row.unchangedSince ??
      row.appliedAt ??
      row.firstSeenAt,
    updatedAt: row.updatedAt,
    autoRejectedAt: row.autoRejectedAt,
    note: row.note ?? "",
  };
}

function toDayStart(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function toDayEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999`);
}

export function buildApplicationsWhere(
  filters: ApplicationFilters,
): Prisma.BossContactWhereInput {
  const where: Prisma.BossContactWhereInput = {};
  const and: Prisma.BossContactWhereInput[] = [];

  if (filters.q) {
    and.push({
      OR: [
        { companyName: { contains: filters.q } },
        { jobTitle: { contains: filters.q } },
      ],
    });
  }

  if (filters.status !== "all") {
    where.stage = filters.status;
  }

  if (filters.source !== "all") {
    where.source = filters.source;
  }

  if (filters.from) {
    const from = toDayStart(filters.from);
    and.push({
      OR: [
        { appliedAt: { gte: from } },
        { appliedAt: null, firstSeenAt: { gte: from } },
      ],
    });
  }

  if (filters.to) {
    const to = toDayEnd(filters.to);
    and.push({
      OR: [
        { appliedAt: { lte: to } },
        { appliedAt: null, firstSeenAt: { lte: to } },
      ],
    });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
}

export function buildApplicationOrderBy(
  filters: Pick<ApplicationFilters, "sortBy" | "sortDir">,
): Prisma.BossContactOrderByWithRelationInput[] {
  if (filters.sortBy === "appliedAt") {
    return [
      { appliedAt: filters.sortDir },
      { firstSeenAt: filters.sortDir },
      { createdAt: filters.sortDir },
    ];
  }

  // 与列表展示的“状态更新”保持一致：优先按 Boss 最后互动时间排序。
  return [
    { sourceActivityAt: filters.sortDir },
    { unchangedSince: filters.sortDir },
    { appliedAt: filters.sortDir },
    { firstSeenAt: filters.sortDir },
  ];
}

export async function getApplications(
  filters: ApplicationFilters,
): Promise<ApplicationsResult> {
  const where = buildApplicationsWhere(filters);
  const total = await prisma.bossContact.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);

  const rows = await prisma.bossContact.findMany({
    where,
    orderBy: buildApplicationOrderBy(filters),
    skip: (page - 1) * filters.pageSize,
    take: filters.pageSize,
    select: APPLICATION_SELECT,
  });

  return {
    items: rows.map(toApplicationListItem),
    total,
    page,
    pageSize: filters.pageSize,
    totalPages,
  };
}

export async function getApplicationFilterOptions(): Promise<ApplicationFilterOptions> {
  const sources = await prisma.bossContact.groupBy({
    by: ["source"],
    orderBy: { source: "asc" },
  });

  return {
    sources: sources.map((source) => source.source).filter(Boolean),
  };
}

export async function getApplicationStageSnapshot() {
  const [total, stageGroups] = await Promise.all([
    prisma.bossContact.count(),
    prisma.bossContact.groupBy({
      by: ["stage"],
      _count: { _all: true },
    }),
  ]);

  return {
    total,
    stageCounts: toApplicationStageCounts(stageGroups),
  };
}

export async function getApplicationStats(
  options: { now?: Date; trendRange?: ApplicationTrendRange } = {},
): Promise<ApplicationStats> {
  const now = options.now ?? new Date();
  const trendRange = options.trendRange ?? "14d";
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const trendStart = getApplicationTrendStart(now, trendRange);

  const [
    total,
    stageGroups,
    recent7Days,
    latestSynced,
    recentRows,
    trendRows,
    sourceGroups,
  ] =
    await Promise.all([
      prisma.bossContact.count(),
      prisma.bossContact.groupBy({
        by: ["stage"],
        _count: { _all: true },
      }),
      prisma.bossContact.count({
        where: {
          OR: [
            { appliedAt: { gte: sevenDaysAgo } },
            { appliedAt: null, firstSeenAt: { gte: sevenDaysAgo } },
          ],
        },
      }),
      prisma.bossContact.findFirst({
        orderBy: { lastSeenAt: "desc" },
        select: { lastSeenAt: true },
      }),
      prisma.bossContact.findMany({
        orderBy: [{ appliedAt: "desc" }, { firstSeenAt: "desc" }],
        take: 5,
        select: APPLICATION_SELECT,
      }),
      prisma.bossContact.findMany({
        where: {
          OR: [
            { appliedAt: { gte: trendStart } },
            { appliedAt: null, firstSeenAt: { gte: trendStart } },
          ],
        },
        select: { appliedAt: true, firstSeenAt: true },
      }),
      prisma.bossContact.groupBy({
        by: ["source"],
        _count: { _all: true },
      }),
    ]);

  const stageCounts = toApplicationStageCounts(stageGroups);

  const trend = buildApplicationTrend(
    trendRows.map((row) => row.appliedAt ?? row.firstSeenAt),
    trendStart,
    trendRange,
  );

  return {
    total,
    recent7Days,
    latestSyncedAt: latestSynced?.lastSeenAt ?? null,
    stageCounts,
    recentApplications: recentRows.map(toApplicationListItem),
    trend,
    sourceCounts: sourceGroups
      .map((group) => ({ source: group.source, count: group._count._all }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
  };
}
