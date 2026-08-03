import assert from "node:assert/strict";
import test from "node:test";

import { BOSS_SOURCE, type NormalizedBossContact } from "./parse";
import { countNewBossContacts, upsertBossContacts } from "./store";

type StoredContact = NormalizedBossContact & {
  id: string;
  appliedAt?: Date | null;
  stage: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  unchangedSince?: Date | null;
  autoRejectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function createFakeDb(initialContacts: StoredContact[] = []) {
  const contacts = new Map(
    initialContacts.map((contact) => [contact.sourceKey, { ...contact }]),
  );

  return {
    contacts,
    bossContact: {
      async findUnique(args: { where: { sourceKey: string } }) {
        return contacts.get(args.where.sourceKey) ?? null;
      },
      async findFirst(args: {
        where: { source: string; companyName: string; jobTitle: string };
      }) {
        return (
          [...contacts.values()].find(
            (contact) =>
              contact.source === args.where.source &&
              contact.companyName === args.where.companyName &&
              contact.jobTitle === args.where.jobTitle,
          ) ?? null
        );
      },
      async create(args: {
        data: Omit<StoredContact, "id" | "createdAt" | "updatedAt">;
      }) {
        const contact: StoredContact = {
          id: `contact-${contacts.size + 1}`,
          createdAt: args.data.firstSeenAt,
          updatedAt: args.data.lastSeenAt,
          ...args.data,
        };
        contacts.set(contact.sourceKey, contact);
        return contact;
      },
      async update(args: {
        where: { sourceKey: string };
        data: Partial<StoredContact> & { lastSeenAt: Date };
      }) {
        const existing = contacts.get(args.where.sourceKey);
        assert.ok(existing);
        const updated = {
          ...existing,
          ...args.data,
          updatedAt: args.data.lastSeenAt,
        };
        contacts.delete(args.where.sourceKey);
        contacts.set(updated.sourceKey, updated);
        return updated;
      },
      async deleteMany(args: {
        where: {
          source: string;
          companyName: string;
          jobTitle: string;
          sourceKey: { not: string };
        };
      }) {
        for (const contact of contacts.values()) {
          if (
            contact.source === args.where.source &&
            contact.companyName === args.where.companyName &&
            contact.jobTitle === args.where.jobTitle &&
            contact.sourceKey !== args.where.sourceKey.not
          ) {
            contacts.delete(contact.sourceKey);
          }
        }
        return { count: 0 };
      },
    },
  };
}

function storedContact(
  overrides: Partial<StoredContact> = {},
): StoredContact {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "existing",
    companyName: "Example Co",
    jobTitle: "Frontend Engineer",
    source: BOSS_SOURCE,
    sourceKey: "boss_zhipin:job:existing",
    stage: "applied",
    firstSeenAt: createdAt,
    lastSeenAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

test("inserts new contacts with source tracking metadata", async () => {
  const db = createFakeDb();
  const now = new Date("2026-07-20T00:00:00.000Z");
  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: "New Co",
        jobTitle: "Backend Engineer",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:new",
        sourceActivityAt: now,
        sourceStatusCode: 1,
      },
    ],
    now,
  );

  assert.equal(summary.inserted, 1);
  assert.equal(summary.highlights[0]?.kind, "new");
  assert.equal(db.contacts.get("boss_zhipin:job:new")?.unchangedSince, now);
});

test("detects a new Boss activity and resets the unchanged timer", async () => {
  const oldActivity = new Date("2026-06-01T00:00:00.000Z");
  const now = new Date("2026-07-20T00:00:00.000Z");
  const db = createFakeDb([
    storedContact({
      sourceActivityAt: oldActivity,
      unchangedSince: oldActivity,
    }),
  ]);

  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: "Example Co",
        jobTitle: "Frontend Engineer",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:existing",
        sourceActivityAt: now,
      },
    ],
    now,
  );

  assert.equal(summary.updated, 1);
  assert.deepEqual(summary.highlights[0]?.changedFields, ["activity"]);
  assert.equal(db.contacts.get("boss_zhipin:job:existing")?.unchangedSince, now);
});

test("auto rejects an applied job 30 days after application when no later activity exists", async () => {
  const appliedAt = new Date("2026-06-01T00:00:00.000Z");
  const now = new Date("2026-07-20T00:00:00.000Z");
  const applied = storedContact({
    appliedAt,
    sourceActivityAt: appliedAt,
  });
  const interviewing = storedContact({
    id: "interviewing",
    sourceKey: "boss_zhipin:job:interviewing",
    companyName: "Interview Co",
    stage: "first_interview",
    appliedAt,
    sourceActivityAt: appliedAt,
  });
  const db = createFakeDb([applied, interviewing]);

  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: applied.companyName,
        jobTitle: applied.jobTitle,
        source: BOSS_SOURCE,
        sourceKey: applied.sourceKey,
      },
      {
        companyName: interviewing.companyName,
        jobTitle: interviewing.jobTitle,
        source: BOSS_SOURCE,
        sourceKey: interviewing.sourceKey,
      },
    ],
    now,
  );

  assert.equal(summary.autoRejected, 1);
  assert.equal(db.contacts.get(applied.sourceKey)?.stage, "rejected");
  assert.equal(db.contacts.get(applied.sourceKey)?.unchangedSince, now);
  assert.equal(db.contacts.get(interviewing.sourceKey)?.stage, "first_interview");
});

test("does not auto reject when Boss has activity after the application time", async () => {
  const now = new Date("2026-07-20T00:00:00.000Z");
  const unchangedSince = new Date("2026-06-02T00:00:00.000Z");
  const db = createFakeDb([
    storedContact({
      appliedAt: new Date("2026-06-01T00:00:00.000Z"),
      sourceActivityAt: new Date("2026-06-02T00:00:00.000Z"),
      unchangedSince,
    }),
  ]);

  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: "Example Co",
        jobTitle: "Frontend Engineer",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:existing",
        sourceActivityAt: new Date("2026-06-02T00:00:00.000Z"),
        sourceStatusCode: 2,
      },
    ],
    now,
  );

  assert.equal(summary.updated, 0);
  assert.equal(summary.unchanged, 1);
  assert.equal(summary.autoRejected, 0);
  assert.equal(
    db.contacts.get("boss_zhipin:job:existing")?.unchangedSince,
    unchangedSince,
  );
});

test("does not auto reject before 30 days have elapsed", async () => {
  const appliedAt = new Date("2026-07-01T00:00:00.000Z");
  const now = new Date("2026-07-20T00:00:00.000Z");
  const contact = storedContact({ appliedAt, sourceActivityAt: appliedAt });
  const db = createFakeDb([contact]);

  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: contact.companyName,
        jobTitle: contact.jobTitle,
        source: BOSS_SOURCE,
        sourceKey: contact.sourceKey,
        sourceActivityAt: appliedAt,
      },
    ],
    now,
  );

  assert.equal(summary.autoRejected, 0);
  assert.equal(db.contacts.get(contact.sourceKey)?.stage, "applied");
});

test("counts new contacts against source keys and company/job identity", async () => {
  const db = createFakeDb([storedContact()]);
  const result = await countNewBossContacts(db, [
    {
      companyName: "Example Co",
      jobTitle: "Frontend Engineer",
      source: BOSS_SOURCE,
      sourceKey: "boss_zhipin:job:existing",
    },
    {
      companyName: "New Co",
      jobTitle: "Backend Engineer",
      source: BOSS_SOURCE,
      sourceKey: "boss_zhipin:job:new",
    },
  ]);

  assert.deepEqual(result, { newCount: 1, existingCount: 1 });
});
