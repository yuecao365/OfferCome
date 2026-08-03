import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAX_SYNC_PAGES,
  getBossSyncStopDecision,
  parseBossSyncMaxPages,
} from "./sync-policy";

test("uses a high safety limit so normal syncs read every Boss page", () => {
  assert.equal(DEFAULT_MAX_SYNC_PAGES, 200);
  assert.equal(parseBossSyncMaxPages([]), 200);
});

test("allows a positive --pages override", () => {
  assert.equal(parseBossSyncMaxPages(["--pages=7"]), 7);
});

test("does not stop because a page only contains existing contacts", () => {
  const decision = getBossSyncStopDecision({
    candidateCount: 15,
    hasMore: true,
    maxPages: 200,
    page: 30,
  });

  assert.deepEqual(decision, { shouldStop: false, stopReason: null });
});

test("stops when Boss says there are no more pages", () => {
  const decision = getBossSyncStopDecision({
    candidateCount: 15,
    hasMore: false,
    maxPages: 200,
    page: 4,
  });

  assert.deepEqual(decision, {
    shouldStop: true,
    stopReason: "no-more-pages",
  });
});

test("stops on an empty page when hasMore is unavailable", () => {
  const decision = getBossSyncStopDecision({
    candidateCount: 0,
    hasMore: null,
    maxPages: 200,
    page: 4,
  });

  assert.deepEqual(decision, { shouldStop: true, stopReason: "empty-page" });
});
