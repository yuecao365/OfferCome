import type { NormalizedBossContact } from "./parse";
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
        autoRejectedAt: null;
        firstSeenAt: Date;
        lastSeenAt: Date;
        stage: "applied";
        unchangedSince: Date;
      };
    }): Promise<unknown>;
    update(args: {
      where: { sourceKey: string };
      data: BossContactUpdateData;
    }): Promise<unknown>;
    deleteMany(args: {
      where: Pick<NormalizedBossContact, "source" | "companyName" | "jobTitle"> & {
        sourceKey: { not: string };
      };
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

function shouldAutoReject(
  existing: BossStoredContact,
  sourceActivityAt: Date | null,
  now: Date,
): boolean {
  if (existing.stage !== "applied" || existing.autoRejectedAt) {
    return false;
  }

  const appliedAt = existing.appliedAt ?? existing.firstSeenAt;
  const rejectionDueAt = appliedAt.getTime() + STALE_APPLICATION_DAYS * DAY_MS;
  const hasActivityAfterApplication =
    sourceActivityAt !== null && sourceActivityAt.getTime() > appliedAt.getTime();

  return now.getTime() >= rejectionDueAt && !hasActivityAfterApplication;
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

    const existingByIdentity = await db.bossContact.findFirst({
      where: {
        source: contact.source,
        companyName: contact.companyName,
        jobTitle: contact.jobTitle,
      },
      orderBy: { firstSeenAt: "asc" },
    });

    seenSourceKeys.add(contact.sourceKey);
    if (existingByIdentity) {
      summary.existingCount += 1;
    } else {
      summary.newCount += 1;
    }
  }

  return summary;
}

async function removeIdentityDuplicates(
  db: BossContactWriteClient,
  contact: NormalizedBossContact,
): Promise<void> {
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
      const existing =
        bySourceKey ??
        (await db.bossContact.findFirst({
          where: {
            source: contact.source,
            companyName: contact.companyName,
            jobTitle: contact.jobTitle,
          },
          orderBy: { firstSeenAt: "asc" },
        }));

      if (!existing) {
        await db.bossContact.create({
          data: {
            ...contact,
            appliedAt: now,
            autoRejectedAt: null,
            firstSeenAt: now,
            lastSeenAt: now,
            stage: "applied",
            unchangedSince: now,
          },
        });
        await removeIdentityDuplicates(db, contact);
        summary.inserted += 1;
        summary.highlights.push({
          kind: "new",
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
