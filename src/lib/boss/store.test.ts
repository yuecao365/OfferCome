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
        where:
          | {
              source: string;
              companyName: string;
              jobTitle: string;
              sourceKey: { not: string };
            }
          | { sourceKey: string };
      }) {
        if (!("source" in args.where)) {
          contacts.delete(args.where.sourceKey);
          return { count: 0 };
        }
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

test("auto rejects an applied job 30 days after the last Boss interaction", async () => {
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

test("keeps an applied job when the last Boss interaction is recent", async () => {
  const now = new Date("2026-07-20T00:00:00.000Z");
  const recentActivity = new Date("2026-07-10T00:00:00.000Z");
  const unchangedSince = new Date("2026-06-02T00:00:00.000Z");
  const db = createFakeDb([
    storedContact({
      appliedAt: new Date("2026-06-01T00:00:00.000Z"),
      sourceActivityAt: recentActivity,
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
        sourceActivityAt: recentActivity,
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

test("keeps same-title postings apart when Boss gives them distinct job ids", async () => {
  const db = createFakeDb([]);
  const now = new Date("2026-08-13T00:00:00.000Z");
  const freshActivity = new Date("2026-08-12T11:43:49.000Z");
  const staleActivity = new Date("2026-06-22T02:21:42.000Z");

  // 同一家公司用完全相同的标题发了两个帖子：昨天刚投的和 6 月的旧帖。
  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: "中电信人工智能公司",
        jobTitle: "智能体平台实习生",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:fresh-posting",
        sourceActivityAt: freshActivity,
      },
      {
        companyName: "中电信人工智能公司",
        jobTitle: "智能体平台实习生",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:stale-posting",
        sourceActivityAt: staleActivity,
      },
    ],
    now,
  );

  // 两条都要保留，旧帖不能覆盖新帖；旧帖导入即过期，只计入自动拒绝。
  assert.equal(summary.inserted, 1);
  assert.equal(summary.autoRejected, 1);
  assert.equal(db.contacts.size, 2);

  const fresh = db.contacts.get("boss_zhipin:job:fresh-posting");
  assert.equal(fresh?.stage, "applied");
  assert.deepEqual(fresh?.sourceActivityAt, freshActivity);

  const stale = db.contacts.get("boss_zhipin:job:stale-posting");
  assert.equal(stale?.stage, "rejected");
});

test("still merges same-title postings that have no stable job id", async () => {
  const db = createFakeDb([]);
  const now = new Date("2026-08-13T00:00:00.000Z");

  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: "Example Co",
        jobTitle: "Frontend Engineer",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:hash:aaa",
        sourceActivityAt: new Date("2026-08-12T00:00:00.000Z"),
      },
      {
        companyName: "Example Co",
        jobTitle: "Frontend Engineer",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:hash:bbb",
        sourceActivityAt: new Date("2026-08-12T00:00:00.000Z"),
      },
    ],
    now,
  );

  assert.equal(summary.inserted, 1);
  assert.equal(db.contacts.size, 1);
});

test("imports a long-idle job straight into the rejected stage", async () => {
  const db = createFakeDb([]);
  const now = new Date("2026-08-13T00:00:00.000Z");

  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: "Stale Co",
        jobTitle: "Backend Engineer",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:stale",
        sourceActivityAt: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        companyName: "Fresh Co",
        jobTitle: "Backend Engineer",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:fresh",
        sourceActivityAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    ],
    now,
  );

  // 新增与自动拒绝互斥：导入即过期的记录不再重复计入新增。
  assert.equal(summary.inserted, 1);
  assert.equal(summary.autoRejected, 1);

  const stale = db.contacts.get("boss_zhipin:job:stale");
  assert.equal(stale?.stage, "rejected");
  // 投递时间取最后互动时间，而不是本次同步时刻。
  assert.deepEqual(stale?.appliedAt, new Date("2026-05-01T00:00:00.000Z"));

  const fresh = db.contacts.get("boss_zhipin:job:fresh");
  assert.equal(fresh?.stage, "applied");
  assert.deepEqual(fresh?.appliedAt, new Date("2026-08-10T00:00:00.000Z"));
});

test("migrates a legacy url-keyed row to the new job-id key instead of duplicating it", async () => {
  const jobUrl = "https://www.zhipin.com/job_detail/abc123.html";
  const legacy = storedContact({
    sourceKey: `boss_zhipin:url:${jobUrl}`,
    jobUrl,
    appliedAt: new Date("2026-05-01T00:00:00.000Z"),
    sourceActivityAt: new Date("2026-05-01T00:00:00.000Z"),
  });
  const db = createFakeDb([legacy]);
  const now = new Date("2026-08-13T00:00:00.000Z");

  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: legacy.companyName,
        jobTitle: legacy.jobTitle,
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:abc123",
        jobUrl,
        sourceActivityAt: new Date("2026-08-12T00:00:00.000Z"),
      },
    ],
    now,
  );

  // 旧行被识别为同一岗位并迁移到新键，而不是重复插入 + 误标自动拒绝。
  assert.equal(summary.inserted, 0);
  assert.equal(db.contacts.size, 1);
  const migrated = db.contacts.get("boss_zhipin:job:abc123");
  assert.ok(migrated);
  assert.equal(migrated.stage, "applied");
  assert.deepEqual(migrated.appliedAt, new Date("2026-05-01T00:00:00.000Z"));
});

test("removes a leftover legacy url-keyed duplicate once the job-id row exists", async () => {
  const jobUrl = "https://www.zhipin.com/job_detail/abc123.html";
  const current = storedContact({
    id: "current",
    sourceKey: "boss_zhipin:job:abc123",
    jobUrl,
    sourceActivityAt: new Date("2026-08-12T00:00:00.000Z"),
  });
  const leftover = storedContact({
    id: "leftover",
    sourceKey: `boss_zhipin:url:${jobUrl}`,
    jobUrl,
  });
  const db = createFakeDb([current, leftover]);

  await upsertBossContacts(
    db,
    [
      {
        companyName: current.companyName,
        jobTitle: current.jobTitle,
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:abc123",
        jobUrl,
        sourceActivityAt: new Date("2026-08-12T00:00:00.000Z"),
      },
    ],
    new Date("2026-08-13T00:00:00.000Z"),
  );

  assert.equal(db.contacts.size, 1);
  assert.ok(db.contacts.get("boss_zhipin:job:abc123"));
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

test("reports the stage the record ends up in, so the sync dialog can suggest a next step", async () => {
  const oldActivity = new Date("2026-07-01T00:00:00.000Z");
  const now = new Date("2026-07-10T00:00:00.000Z");
  // 用户已经把这条投递推到一面；Boss 又有新互动。
  const db = createFakeDb([
    storedContact({
      stage: "first_interview",
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

  assert.equal(summary.highlights[0]?.kind, "source_changed");
  // 同步绝不自己推进阶段，只如实报告当前停在哪一档。
  assert.equal(summary.highlights[0]?.currentStage, "first_interview");
  assert.equal(db.contacts.get("boss_zhipin:job:existing")?.stage, "first_interview");
});

test("reports the rejected stage once a record is auto rejected", async () => {
  const appliedAt = new Date("2026-06-01T00:00:00.000Z");
  const now = new Date("2026-07-20T00:00:00.000Z");
  const db = createFakeDb([
    storedContact({ appliedAt, sourceActivityAt: appliedAt }),
  ]);

  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: "Example Co",
        jobTitle: "Frontend Engineer",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:existing",
        sourceActivityAt: appliedAt,
      },
    ],
    now,
  );

  const autoRejected = summary.highlights.find(
    (item) => item.kind === "auto_rejected",
  );
  assert.equal(autoRejected?.currentStage, "rejected");
});

test("reports the applied stage for brand new records", async () => {
  const now = new Date("2026-07-10T00:00:00.000Z");
  const db = createFakeDb();

  const summary = await upsertBossContacts(
    db,
    [
      {
        companyName: "New Co",
        jobTitle: "Backend Engineer",
        source: BOSS_SOURCE,
        sourceKey: "boss_zhipin:job:new",
        sourceActivityAt: now,
      },
    ],
    now,
  );

  assert.equal(summary.highlights[0]?.kind, "new");
  assert.equal(summary.highlights[0]?.currentStage, "applied");
});

test("flags a job that Boss now reports as taken down", async () => {
  const activity = new Date("2026-08-20T00:00:00.000Z");
  const now = new Date("2026-08-26T00:00:00.000Z");
  const db = createFakeDb([
    storedContact({
      appliedAt: activity,
      sourceActivityAt: activity,
      sourceStatusCode: 1,
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
        sourceActivityAt: activity,
        sourceStatusCode: 2,
      },
    ],
    now,
  );

  const highlight = summary.highlights[0];
  assert.equal(highlight?.kind, "source_changed");
  assert.deepEqual(highlight?.changedFields, ["source_status"]);
  assert.equal(highlight?.sourceJobClosed, true);
  // 同步只如实上报，绝不自己把阶段改成拒绝。
  assert.equal(highlight?.currentStage, "applied");
  assert.equal(db.contacts.get("boss_zhipin:job:existing")?.stage, "applied");
});

test("does not flag a job that is still open", async () => {
  const activity = new Date("2026-08-20T00:00:00.000Z");
  const now = new Date("2026-08-26T00:00:00.000Z");
  const db = createFakeDb([
    storedContact({
      appliedAt: activity,
      sourceActivityAt: activity,
      sourceStatusCode: 1,
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
        sourceStatusCode: 1,
      },
    ],
    now,
  );

  assert.deepEqual(summary.highlights[0]?.changedFields, ["activity"]);
  assert.equal(summary.highlights[0]?.sourceJobClosed, false);
});
