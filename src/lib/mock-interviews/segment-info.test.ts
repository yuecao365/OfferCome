import assert from "node:assert/strict";
import test from "node:test";

import { buildSegmentInfo } from "./segment-info";

test("buildSegmentInfo reads the segment metadata written at cut time; bad data falls back", () => {
  assert.deepEqual(buildSegmentInfo({ metadata: { areaName: "MySQL 索引", verdict: "failed", depth: 2 }, sourceKind: "quick" }), { areaName: "MySQL 索引", kind: "quick", verdict: "failed" });
  assert.deepEqual(buildSegmentInfo({ metadata: "not an object", sourceKind: "project" }), { areaName: null, kind: "project", verdict: null });
});
