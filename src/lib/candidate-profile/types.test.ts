import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProfileSourceType } from "./types";

test("uses interview kind as the authoritative real or simulated source", () => {
  assert.equal(normalizeProfileSourceType("mock", "mock"), "mock_text");
  assert.equal(normalizeProfileSourceType("real", "mock"), "mock_text");
  assert.equal(normalizeProfileSourceType("real", "real"), "real_summary");
  assert.equal(
    normalizeProfileSourceType("real_transcript", "real"),
    "real_transcript",
  );
});
