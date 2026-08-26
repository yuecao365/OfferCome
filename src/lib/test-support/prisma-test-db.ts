import Database from "better-sqlite3";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * 给编排测试用的一次性 SQLite 库。
 *
 * 这些流程的正确性大半压在乐观锁（updateMany + count !== 1）和事务回滚上，
 * 手写的假 prisma 恰恰测不出这两样，所以用真库：借 demo.db 的表结构，
 * 清空全部数据后交给测试自己造数据。
 *
 * 文件名不以 .test.ts 结尾，不会被测试 glob 当成用例收集。
 */
export type TestDatabase = {
  url: string;
  cleanup: () => void;
};

export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(path.join(tmpdir(), "offerlai-test-"));
  const file = path.join(directory, "test.db");
  copyFileSync(path.join(process.cwd(), "prisma", "demo.db"), file);

  const database = new Database(file);
  try {
    database.pragma("foreign_keys = OFF");
    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name NOT LIKE '_prisma%'`,
      )
      .all() as { name: string }[];
    for (const table of tables) {
      database.prepare(`DELETE FROM "${table.name}"`).run();
    }
  } finally {
    database.close();
  }

  return {
    url: `file:${file}`,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
