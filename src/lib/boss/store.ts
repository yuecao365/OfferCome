import {
  BOSS_SOURCE,
  hasStableBossSourceId,
  toBossSourceKey,
  type NormalizedBossContact,
} from "./parse";
import type {
  BossSyncChangedField,
  BossSyncHighlight,
} from "./contracts";

export type { BossSyncHighlight } from "./contracts";

const STALE_APPLICATION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type BossSyncSummary = {
  found: number;
  inserted: number;
  updated: number;
  unchanged: number;
  autoRejected: number;
  failed: number;
  highlights: BossSyncHighlight[];
};

export type BossStoredContact = {
  sourceKey: string;
  source: string;
  companyName: string;
  jobTitle: string;
  jobUrl?: string | null;
  appliedAt?: Date | null;
  stage?: string | null;
  sourceActivityAt?: Date | null;
  sourceStatusCode?: number | null;
  unchangedSince?: Date | null;
  autoRejectedAt?: Date | null;
  firstSeenAt: Date;
};

type BossContactUpdateData = Partial<NormalizedBossContact> & {
  autoRejectedAt?: Date | null;
  lastSeenAt: Date;
  stage?: string;
  unchangedSince?: Date | null;
};

export type BossContactReadClient = {
  bossContact: {
    findUnique(args: {
      where: { sourceKey: string };
    }): Promise<BossStoredContact | null>;
    findFirst(args: {
      where: {
        source: string;
        companyName: string;
        jobTitle: string;
      };
      orderBy?: { firstSeenAt: "asc" | "desc" };
    }): Promise<BossStoredContact | null>;
  };
};

export type BossContactWriteClient = BossContactReadClient & {
  bossContact: BossContactReadClient["bossContact"] & {
    create(args: {
      data: NormalizedBossContact & {
        appliedAt: Date;
        autoRejectedAt: Date | null;
        firstSeenAt: Date;
        lastSeenAt: Date;
        stage: "applied" | "rejected";
        unchangedSince: Date;
      };
    }): Promise<unknown>;
    update(args: {
      where: { sourceKey: string };
      data: BossContactUpdateData;
    }): Promise<unknown>;
    deleteMany(args: {
      where:
        | (Pick<
            NormalizedBossContact,
            "source" | "companyName" | "jobTitle"
          > & { sourceKey: { not: string } })
        | { sourceKey: string };
    }): Promise<unknown>;
  };
};

export type UpsertBossContactsOptions = {
  onError?: (contact: NormalizedBossContact, error: unknown) => void;
};

export type BossContactNoveltySummary = {
  newCount: number;
  existingCount: number;
};

function sameDate(left: Date | null | undefined, right: Date | null | undefined) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function getSourceChanges(
  existing: BossStoredContact,
  contact: NormalizedBossContact,
): BossSyncChangedField[] {
  const changes: BossSyncChangedField[] = [];

  if (existing.companyName !== contact.companyName) {
    changes.push("company_name");
  }
  if (existing.jobTitle !== contact.jobTitle) {
    changes.push("job_title");
  }
  if (
    existing.sourceActivityAt &&
    contact.sourceActivityAt &&
    !sameDate(existing.sourceActivityAt, contact.sourceActivityAt)
  ) {
    changes.push("activity");
  }
  if (
    existing.sourceStatusCode !== null &&
    existing.sourceStatusCode !== undefined &&
    contact.sourceStatusCode !== null &&
    contact.sourceStatusCode !== undefined &&
    existing.sourceStatusCode !== contact.sourceStatusCode
  ) {
    changes.push("source_status");
  }

  return changes;
}

/** 距最后一次互动是否已超过 30 天。 */
export function isStaleSinceLastActivity(
  lastActivityAt: Date,
  now: Date,
): boolean {
  return (
    now.getTime() - lastActivityAt.getTime() >=
    STALE_APPLICATION_DAYS * DAY_MS
  );
}

/**
 * 已有记录是否该自动标记拒绝。只有仍停留在“已投递”且没被自动拒过的记录
 * 才参与判定，用户手动改过的阶段不会被覆盖。
 */
function shouldAutoReject(
  existing: BossStoredContact,
  sourceActivityAt: Date | null,
  now: Date,
): boolean {
  if (existing.stage !== "applied" || existing.autoRejectedAt) {
    return false;
  }

  return isStaleSinceLastActivity(
    sourceActivityAt ?? existing.appliedAt ?? existing.firstSeenAt,
    now,
  );
}

export async function countNewBossContacts(
  db: BossContactReadClient,
  contacts: NormalizedBossContact[],
  seenSourceKeys = new Set<string>(),
): Promise<BossContactNoveltySummary> {
  const summary: BossContactNoveltySummary = { newCount: 0, existingCount: 0 };

  for (const contact of contacts) {
    if (seenSourceKeys.has(contact.sourceKey)) {
      summary.existingCount += 1;
      continue;
    }

    const existing = await db.bossContact.findUnique({
      where: { sourceKey: contact.sourceKey },
    });
    if (existing) {
      seenSourceKeys.add(contact.sourceKey);
      summary.existingCount += 1;
      continue;
    }

    const existingByIdentity = canMatchByIdentity(contact)
      ? await db.bossContact.findFirst({
          where: {
            source: contact.source,
            companyName: contact.companyName,
            jobTitle: contact.jobTitle,
          },
          orderBy: { firstSeenAt: "asc" },
        })
      : null;

    seenSourceKeys.add(contact.sourceKey);
    if (existingByIdentity) {
      summary.existingCount += 1;
    } else {
      summary.newCount += 1;
    }
  }

  return summary;
}

/**
 * 同一家公司会用完全相同的标题重复发帖，它们的岗位 ID 不同，是不同的帖子。
 * 因此只有在拿不到岗位 ID（sourceKey 为哈希）时，才用公司名+岗位名认身份，
 * 否则会把两个不同的帖子合并、并用旧帖覆盖新帖的互动时间。
 */
function canMatchByIdentity(contact: NormalizedBossContact): boolean {
  return !hasStableBossSourceId(contact.sourceKey);
}

/**
 * 旧版采集器只有详情页链接，sourceKey 是 `:url:` 形式；现在同一岗位按
 * 岗位 ID 生成 `:job:` 键。用链接反推旧键，才能认出老库里的同一条记录，
 * 否则升级后首次同步会整批重复插入并触发错误的自动拒绝。
 */
function legacyBossUrlKey(contact: NormalizedBossContact): string | null {
  if (!contact.jobUrl) return null;
  const urlKey = toBossSourceKey({
    companyName: contact.companyName,
    jobTitle: contact.jobTitle,
    href: contact.jobUrl,
  });
  return urlKey !== contact.sourceKey &&
    urlKey.startsWith(`${BOSS_SOURCE}:url:`)
    ? urlKey
    : null;
}

async function removeIdentityDuplicates(
  db: BossContactWriteClient,
  contact: NormalizedBossContact,
): Promise<void> {
  if (!canMatchByIdentity(contact)) return;

  await db.bossContact.deleteMany({
    where: {
      source: contact.source,
      companyName: contact.companyName,
      jobTitle: contact.jobTitle,
      sourceKey: { not: contact.sourceKey },
    },
  });
}

export async function upsertBossContacts(
  db: BossContactWriteClient,
  contacts: NormalizedBossContact[],
  now = new Date(),
  options: UpsertBossContactsOptions = {},
): Promise<BossSyncSummary> {
  const summary: BossSyncSummary = {
    found: contacts.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    autoRejected: 0,
    failed: 0,
    highlights: [],
  };

  for (const contact of contacts) {
    try {
      const bySourceKey = await db.bossContact.findUnique({
        where: { sourceKey: contact.sourceKey },
      });
      const legacyKey = legacyBossUrlKey(contact);
      const byLegacyUrl =
        legacyKey && !bySourceKey
          ? await db.bossContact.findUnique({
              where: { sourceKey: legacyKey },
            })
          : null;
      const existing =
        bySourceKey ??
        byLegacyUrl ??
        (canMatchByIdentity(contact)
          ? await db.bossContact.findFirst({
              where: {
                source: contact.source,
                companyName: contact.companyName,
                jobTitle: contact.jobTitle,
              },
              orderBy: { firstSeenAt: "asc" },
            })
          : null);
      // 主键命中时，同一岗位可能还残留一条旧 `:url:` 键的重复行，顺手清掉。
      if (bySourceKey && legacyKey) {
        await db.bossContact.deleteMany({ where: { sourceKey: legacyKey } });
      }

      if (!existing) {
        // 投递时间用 Boss 的最后互动时间，这样首次同步导入的历史岗位不会
        // 全部挤在“今天投递”。拿不到互动时间才退回同步时刻。
        const appliedAt = contact.sourceActivityAt ?? now;
        const autoRejected = isStaleSinceLastActivity(appliedAt, now);
        await db.bossContact.create({
          data: {
            ...contact,
            appliedAt,
            autoRejectedAt: autoRejected ? now : null,
            firstSeenAt: now,
            lastSeenAt: now,
            stage: autoRejected ? "rejected" : "applied",
            unchangedSince: appliedAt,
          },
        });
        await removeIdentityDuplicates(db, contact);
        // 导入即过期的记录只计入“自动拒绝”，不再同时计入“新增”，
        // 否则弹窗里“新增投递”的数字和新增列表会对不上。
        if (autoRejected) {
          summary.autoRejected += 1;
        } else {
          summary.inserted += 1;
        }
        summary.highlights.push({
          kind: autoRejected ? "auto_rejected" : "new",
          sourceKey: contact.sourceKey,
          companyName: contact.companyName,
          jobTitle: contact.jobTitle,
          changedFields: [],
        });
        continue;
      }

      const changedFields = getSourceChanges(existing, contact);
      let unchangedSince =
        changedFields.length > 0 ? now : (existing.unchangedSince ?? now);
      const sourceActivityAt =
        contact.sourceActivityAt ?? existing.sourceActivityAt ?? null;
      const autoRejected = shouldAutoReject(existing, sourceActivityAt, now);
      if (autoRejected) {
        unchangedSince = now;
      }

      await db.bossContact.update({
        where: { sourceKey: existing.sourceKey },
        data: {
          sourceKey: contact.sourceKey,
          companyName: contact.companyName,
          jobTitle: contact.jobTitle,
          jobUrl: contact.jobUrl ?? existing.jobUrl ?? null,
          sourceActivityAt,
          sourceStatusCode:
            contact.sourceStatusCode ?? existing.sourceStatusCode ?? null,
          unchangedSince,
          lastSeenAt: now,
          ...(autoRejected ? { stage: "rejected", autoRejectedAt: now } : {}),
        },
      });
      await removeIdentityDuplicates(db, contact);

      if (changedFields.length > 0) {
        summary.updated += 1;
        summary.highlights.push({
          kind: "source_changed",
          sourceKey: contact.sourceKey,
          companyName: contact.companyName,
          jobTitle: contact.jobTitle,
          changedFields,
        });
      } else if (autoRejected) {
        summary.updated += 1;
      } else {
        summary.unchanged += 1;
      }

      if (autoRejected) {
        summary.autoRejected += 1;
        summary.highlights.push({
          kind: "auto_rejected",
          sourceKey: contact.sourceKey,
          companyName: contact.companyName,
          jobTitle: contact.jobTitle,
          changedFields: [],
        });
      }
    } catch (error) {
      summary.failed += 1;
      options.onError?.(contact, error);
    }
  }

  return summary;
}
