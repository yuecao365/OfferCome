import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_STAGES,
  parseApplicationFilters,
  stageLabel,
} from "./types";

test("parses application filters with defaults and supported page sizes", () => {
  const filters = parseApplicationFilters({
    q: " frontend ",
    status: "first_interview",
    source: "boss_zhipin",
    page: "3",
    pageSize: "50",
    sortBy: "appliedAt",
    sortDir: "asc",
    from: "2026-07-01",
    to: "2026-07-06",
  });

  assert.equal(filters.q, "frontend");
  assert.equal(filters.status, "first_interview");
  assert.equal(filters.source, "boss_zhipin");
  assert.equal(filters.page, 3);
  assert.equal(filters.pageSize, 50);
  assert.equal(filters.sortBy, "appliedAt");
  assert.equal(filters.sortDir, "asc");
  assert.equal(filters.from, "2026-07-01");
  assert.equal(filters.to, "2026-07-06");
});

test("defaults application page size to 12 and accepts compact page size", () => {
  const defaultFilters = parseApplicationFilters({});
  const compactFilters = parseApplicationFilters({ pageSize: "12" });

  assert.equal(defaultFilters.pageSize, 12);
  assert.equal(compactFilters.pageSize, 12);
});

test("falls back for invalid application filter values", () => {
  const filters = parseApplicationFilters({
    status: "unknown",
    page: "-2",
    pageSize: "500",
    sortBy: "companyName",
    sortDir: "sideways",
    from: "not-a-date",
  });

  assert.equal(filters.status, "all");
  assert.equal(filters.page, 1);
  assert.equal(filters.pageSize, 12);
  assert.equal(filters.sortBy, "updatedAt");
  assert.equal(filters.sortDir, "desc");
  assert.equal(filters.from, "");
});

test("defines labels for every application stage", () => {
  assert.deepEqual(APPLICATION_STAGES, [
    "applied",
    "assessment",
    "first_interview",
    "second_interview",
    "third_interview",
    "hr_interview",
    "offer",
    "rejected",
  ]);
  assert.equal(stageLabel("assessment"), "笔试/测评");
  assert.equal(stageLabel("hr_interview"), "HR 面");
});
