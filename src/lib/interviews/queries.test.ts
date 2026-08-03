import assert from "node:assert/strict";
import test from "node:test";

import { toInterviewStats } from "./queries";

test("maps persisted interview statuses into overview metrics", () => {
  const stats = toInterviewStats([
    { status: "scheduled", _count: { _all: 3 } },
    { status: "completed", _count: { _all: 2 } },
    { status: "canceled", _count: { _all: 1 } },
    { status: "offer", _count: { _all: 1 } },
    { status: "in_progress", _count: { _all: 2 } },
  ]);

  assert.deepEqual(stats, {
    total: 9,
    offers: 1,
    passed: 3,
    failed: 1,
    preparing: 3,
    active: 2,
  });
});

test("keeps unknown statuses in the total without misclassifying them", () => {
  const stats = toInterviewStats([
    { status: "legacy_unknown", _count: { _all: 2 } },
  ]);

  assert.equal(stats.total, 2);
  assert.equal(stats.offers, 0);
  assert.equal(stats.passed, 0);
  assert.equal(stats.failed, 0);
  assert.equal(stats.preparing, 0);
  assert.equal(stats.active, 0);
});
