import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApplicationOrderBy,
  buildApplicationsWhere,
  toApplicationListItem,
} from "./queries";
import type { ApplicationFilters } from "./types";

const baseFilters: ApplicationFilters = {
  q: "",
  status: "all",
  source: "all",
  from: "",
  to: "",
  sortBy: "updatedAt",
  sortDir: "desc",
  page: 1,
  pageSize: 20,
};

test("builds where input for search, stage, source, and applied date range", () => {
  const where = buildApplicationsWhere({
    ...baseFilters,
    q: "字节 前端",
    status: "first_interview",
    source: "boss_zhipin",
    from: "2026-07-01",
    to: "2026-07-06",
  });

  assert.deepEqual(where.companyName, undefined);
  assert.equal(where.stage, "first_interview");
  assert.equal(where.source, "boss_zhipin");
  assert.ok(Array.isArray(where.AND));
  assert.equal(where.AND?.length, 3);
});

test("builds stable order clauses for supported sorts", () => {
  assert.deepEqual(
    buildApplicationOrderBy({ ...baseFilters, sortBy: "appliedAt", sortDir: "asc" }),
    [{ appliedAt: "asc" }, { firstSeenAt: "asc" }, { createdAt: "asc" }],
  );
  assert.deepEqual(buildApplicationOrderBy(baseFilters), [
    { sourceActivityAt: "desc" },
    { unchangedSince: "desc" },
    { appliedAt: "desc" },
    { firstSeenAt: "desc" },
  ]);
});

test("maps nullable application fields to display-safe list items", () => {
  const firstSeenAt = new Date("2026-07-01T01:00:00.000Z");
  const item = toApplicationListItem({
    id: "contact-1",
    companyName: "Example Co",
    jobTitle: "Frontend Engineer",
    source: "boss_zhipin",
    jobUrl: null,
    jobDescription: null,
    stage: null,
    appliedAt: null,
    firstSeenAt,
    lastSeenAt: new Date("2026-07-02T01:00:00.000Z"),
    sourceActivityAt: null,
    unchangedSince: new Date("2026-07-02T02:00:00.000Z"),
    updatedAt: new Date("2026-07-03T01:00:00.000Z"),
    autoRejectedAt: null,
    note: null,
  });

  assert.equal(item.stage, "applied");
  assert.equal(item.appliedAt, firstSeenAt);
  assert.equal(item.jobUrl, "");
  assert.equal(item.note, "");
  assert.equal(
    item.statusUpdatedAt.toISOString(),
    "2026-07-02T02:00:00.000Z",
  );
});

test("shows the Boss interaction time as the status update time", () => {
  const item = toApplicationListItem({
    id: "contact-2",
    companyName: "Example Co",
    jobTitle: "Frontend Engineer",
    source: "boss_zhipin",
    jobUrl: null,
    jobDescription: null,
    stage: "applied",
    appliedAt: new Date("2026-07-01T00:00:00.000Z"),
    firstSeenAt: new Date("2026-07-01T00:00:00.000Z"),
    lastSeenAt: new Date("2026-08-13T00:00:00.000Z"),
    sourceActivityAt: new Date("2026-08-10T09:30:00.000Z"),
    unchangedSince: new Date("2026-07-02T02:00:00.000Z"),
    updatedAt: new Date("2026-08-13T00:00:00.000Z"),
    autoRejectedAt: null,
    note: null,
  });

  assert.equal(
    item.statusUpdatedAt.toISOString(),
    "2026-08-10T09:30:00.000Z",
  );
});
