import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolvePrismaSqliteUrl } from "./sqlite-url";

test("resolves relative Prisma SQLite file URLs from the project root", () => {
  const projectRoot = path.resolve("C:/workspace/career-agent");

  assert.equal(
    resolvePrismaSqliteUrl("file:./dev.db", projectRoot),
    `file:${path.resolve(projectRoot, "dev.db")}`,
  );
});

test("leaves non-file SQLite URLs unchanged", () => {
  assert.equal(resolvePrismaSqliteUrl(":memory:"), ":memory:");
});
