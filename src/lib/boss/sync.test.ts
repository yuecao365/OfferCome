import assert from "node:assert/strict";
import test from "node:test";

import {
  BossBrowserClosedError,
  BossBrowserLoginRequiredError,
  type BossBrowserCollectionResult,
} from "./browser-collector";
import {
  createBossSyncLock,
  getBossStorageStatePath,
  runBossSync,
  type BossSyncRunnerDb,
} from "./sync";

const noopDb = {} as BossSyncRunnerDb;

function browserResult(): BossBrowserCollectionResult {
  return {
    contacts: [
      {
        companyName: "Example Company",
        jobTitle: "Frontend Engineer",
        source: "boss_zhipin",
        sourceKey: "boss_zhipin:job:example-1",
      },
    ],
    diagnostics: [
      {
        page: 1,
        url: "https://www.zhipin.com/web/geek/recommend",
        candidateCount: 1,
        collectionSource: "browser",
      },
    ],
    stopReason: "no-more-pages",
  };
}

test("resolves the Boss storage state path under .local", () => {
  assert.equal(
    getBossStorageStatePath("C:\\workspace\\career-agent").replaceAll("\\", "/"),
    "C:/workspace/career-agent/.local/boss/storageState.json",
  );
});

test("returns login_required when the browser collector requires login", async () => {
  const result = await runBossSync({
    db: noopDb,
    collectContacts: async () => {
      throw new BossBrowserLoginRequiredError("请在浏览器中完成登录或验证。");
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.status, "login_required");
  assert.match(result.message, /登录|验证/);
});

test("preserves an actionable message when the sync browser is closed", async () => {
  const result = await runBossSync({
    db: noopDb,
    collectContacts: async () => {
      throw new BossBrowserClosedError();
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.status, "failed");
  assert.match(result.message, /保持窗口打开/);
});

test("uses the browser collector and keeps dry-run free of database writes", async () => {
  let collectorCalls = 0;
  const result = await runBossSync({
    db: noopDb,
    dryRun: true,
    collectContacts: async () => {
      collectorCalls += 1;
      return browserResult();
    },
  });

  assert.equal(collectorCalls, 1);
  assert.equal(result.success, true);
  assert.equal(result.found, 1);
  assert.equal(result.inserted, 0);
  assert.equal(result.contacts[0]?.companyName, "Example Company");
  assert.equal(result.stopReason, "no-more-pages");
});

test("serializes sync runs with an in-memory lock", async () => {
  const lock = createBossSyncLock();
  let releaseFirstRun: (() => void) | undefined;

  const first = lock.run(() => {
    return new Promise((resolve) => {
      releaseFirstRun = () => resolve("first");
    });
  });
  const second = await lock.run(async () => "second");

  assert.deepEqual(second, {
    success: false,
    status: "failed",
    message: "Boss 同步正在进行中，请稍后再试。",
  });

  releaseFirstRun?.();
  assert.equal(await first, "first");
});
