import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * 给编排测试用的一次性 SQLite 库。
 *
 * 这些流程的正确性大半压在乐观锁（updateMany + count !== 1）和事务回滚上，
 * 手写的假 prisma 恰恰测不出这两样，所以用真库。
 *
 * 表结构直接由 schema.prisma 生成，不依赖任何预置的 .db 文件——
 * schema 是唯一真相来源，改了字段测试库自动跟上。
 * 建表 SQL 按 schema 内容哈希缓存成模板，后续用例只需拷贝文件。
 *
 * 文件名不以 .test.ts 结尾，不会被测试 glob 当成用例收集。
 */
export type TestDatabase = {
  url: string;
  cleanup: () => void;
};

function createSchemaSql(projectRoot: string): string {
  const prismaCli = path.join(projectRoot, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );

  if (result.status !== 0 || !result.stdout.includes("CREATE TABLE")) {
    throw new Error(result.stderr || "无法根据 schema.prisma 生成测试库结构。");
  }
  return result.stdout;
}

/** 空库模板：按 schema 内容哈希缓存，schema 变了自动重建。 */
function ensureTemplateDatabase(): string {
  const projectRoot = process.cwd();
  const schema = readFileSync(path.join(projectRoot, "prisma", "schema.prisma"), "utf8");
  const digest = createHash("sha256").update(schema).digest("hex").slice(0, 16);
  const directory = path.join(tmpdir(), "offerlai-test-template");
  const template = path.join(directory, `schema-${digest}.db`);
  if (existsSync(template)) return template;

  mkdirSync(directory, { recursive: true });
  const building = `${template}.${process.pid}.building`;
  const database = new Database(building);
  try {
    database.exec(createSchemaSql(projectRoot));
  } finally {
    database.close();
  }
  // 先建后改名：并发跑用例时不会读到只写了一半的模板。
  copyFileSync(building, template);
  rmSync(building, { force: true });
  return template;
}

export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(path.join(tmpdir(), "offerlai-test-"));
  const file = path.join(directory, "test.db");
  copyFileSync(ensureTemplateDatabase(), file);

  return {
    url: `file:${file}`,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
