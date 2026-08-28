import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

import { PrismaClient } from "@/generated/prisma/client";
import { resolvePrismaSqliteUrl } from "@/lib/sqlite-url";
import { createTestDatabase } from "@/lib/test-support/prisma-test-db";

import { createTrialPrismaProxy } from "./db";
import { runWithTrialContext } from "./session";

/**
 * 按会话数据库代理的集成测试：会话隔离是体验模式的安全边界，
 * 必须用真库验证，不能靠假客户端。
 */

const template = createTestDatabase();
const sessionsDir = mkdtempSync(path.join(tmpdir(), "offerlai-trial-test-"));

const proxy = createTrialPrismaProxy(
  (url) =>
    new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: resolvePrismaSqliteUrl(url) }),
    }),
  {
    sourceDbPath: template.url.replace(/^file:/, ""),
    directory: sessionsDir,
  },
);

const sessionA = { sessionId: crypto.randomUUID(), aiConfig: null };
const sessionB = { sessionId: crypto.randomUUID(), aiConfig: null };

function inSession<T>(
  session: typeof sessionA,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithTrialContext(session, fn);
}

before(() => {
  process.env.APP_MODE = "trial";
});

after(async () => {
  for (const session of [sessionA, sessionB]) {
    await inSession(session, () => proxy.$disconnect()).catch(() => undefined);
  }
  delete process.env.APP_MODE;
  rmSync(sessionsDir, { recursive: true, force: true });
  template.cleanup();
});

test("keeps each visitor session in its own database", async () => {
  await inSession(sessionA, () =>
    proxy.resume.create({
      data: {
        originalName: "访客A的简历.pdf",
        storedName: `trial-${sessionA.sessionId}`,
        filePath: "",
        mimeType: "text/plain",
        fileSize: 10,
      },
    }),
  );

  assert.equal(await inSession(sessionA, () => proxy.resume.count()), 1);
  // 另一个会话看不到 A 的数据——这是体验模式的安全边界。
  assert.equal(await inSession(sessionB, () => proxy.resume.count()), 0);
  // 回到 A，数据还在：同一会话内刷新不丢状态。
  assert.equal(await inSession(sessionA, () => proxy.resume.count()), 1);
});

test("supports transactions through the lazy proxy", async () => {
  const count = await inSession(sessionA, () =>
    proxy.$transaction(async (tx) => tx.resume.count()),
  );
  assert.equal(count, 1);
});

test("refuses to touch any database without a session", async () => {
  await assert.rejects(proxy.resume.count(), /体验会话尚未建立/);
});
